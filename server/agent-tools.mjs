import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScene, read } from "./core.mjs";

const object = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const shotInput = {
  shotId: { type: "string", description: "Shot ID from get_project" },
  scene: {
    type: "object",
    description: "Optional complete draft scene; previewed without saving",
  },
};
export const agentTools = [
  {
    name: "get_project",
    description:
      "Read this job's project, shot IDs, narration, word timing and saved scene source.",
    inputSchema: object(),
  },
  {
    name: "get_words",
    description:
      "Read word timings overlapping an optional time range in project seconds.",
    inputSchema: object({
      start: { type: "number", minimum: 0 },
      end: { type: "number", minimum: 0 },
    }),
  },
  {
    name: "get_storyboard",
    description:
      "Read shot IDs, titles, narration and time boundaries without scene source.",
    inputSchema: object(),
  },
  {
    name: "list_assets",
    description: "Read the project's local asset paths and attribution ledger.",
    inputSchema: object(),
  },
  {
    name: "measure_layout",
    description:
      "Measure rendered text bounds, text overflow, off-screen 2D objects and overlapping text boxes at a shot-relative time. Bounds are in design coordinates; overlapping boxes are candidates for visual review, not necessarily defects. Path and 3D geometry bounds are not measured.",
    inputSchema: object(
      { ...shotInput, time: { type: "number", minimum: 0 } },
      ["shotId"],
    ),
  },
  {
    name: "render_frames",
    description:
      "Render up to three PNG frames of a saved shot or candidate scene. Times are seconds relative to the shot start. Returns actual images and text-fit metrics. Does not save changes.",
    inputSchema: object(
      {
        ...shotInput,
        times: {
          type: "array",
          items: { type: "number", minimum: 0 },
          minItems: 1,
          maxItems: 3,
        },
      },
      ["shotId"],
    ),
  },
  {
    name: "check_preview",
    description:
      "Check a saved shot or candidate scene at start, middle and end for blank frames and overflowing text. Does not save changes.",
    inputSchema: object(shotInput, ["shotId"]),
  },
].map((tool) => ({
  ...tool,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}));
const text = (value) => ({ type: "text", text: JSON.stringify(value) });

export class AgentTools {
  constructor(store, pipeline) {
    this.store = store;
    this.pipeline = pipeline;
    this.sessions = new Map();
  }
  register(job, emit) {
    if (!job.projectId) return null;
    this.store.project(job.projectId);
    const token = crypto.randomBytes(32).toString("hex");
    this.sessions.set(token, {
      job,
      emit,
      tail: Promise.resolve(),
      expires: Date.now() + 31 * 60_000,
    });
    const script = fileURLToPath(
      new URL("./mcp-bridge.mjs", import.meta.url),
    ).replace("app.asar", "app.asar.unpacked");
    return {
      config: {
        command: process.execPath,
        args: [path.resolve(script)],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          FRAMECRAFT_TOOL_URL: this.pipeline.base + "/api/agent-tools",
          FRAMECRAFT_TOOL_TOKEN: token,
        },
      },
      call: (name, args) => this.call(token, name, args),
      dispose: () => this.sessions.delete(token),
    };
  }
  async call(token, name, args = {}) {
    const session = this.sessions.get(token);
    if (!session || session.expires < Date.now() || session.job.cancelled)
      throw Error("Agent tool session expired");
    if (name === "__list") return { tools: agentTools };
    if (!agentTools.some((tool) => tool.name === name))
      throw Error("Unknown agent tool");
    const previous = session.tail;
    let release;
    session.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (!this.sessions.has(token) || session.job.cancelled)
        throw Error("Agent tool session expired");
      session.emit("info", `Agent tool: ${name}`);
      const p = structuredClone(this.store.project(session.job.projectId));
      if (name === "get_words") {
        const start = args.start ?? 0,
          end = args.end ?? Infinity;
        if (
          !Number.isFinite(start) ||
          start < 0 ||
          end <= start ||
          (end !== Infinity && !Number.isFinite(end))
        )
          throw Error("Invalid word time range");
        return {
          content: [
            text((p.words || []).filter((w) => w.end > start && w.start < end)),
          ],
        };
      }
      if (name === "get_storyboard")
        return { content: [text(p.shots.map(({ scene, ...shot }) => shot))] };
      if (name === "list_assets")
        return {
          content: [
            text(
              read(
                path.join(
                  this.store.projectDir(p.id),
                  "assets",
                  "ATTRIBUTIONS.json",
                ),
                [],
              ),
            ),
          ],
        };
      if (name === "get_project")
        return {
          content: [
            text({
              id: p.id,
              title: p.title,
              format: p.format,
              words: p.words,
              shots: p.shots,
            }),
          ],
        };
      const shot = p.shots.find((s) => s.id === args.shotId);
      if (!shot)
        throw Error(
          "Unknown shot ID; use get_project to list this project's shots",
        );
      if (args.scene) shot.scene = validateScene(args.scene);
      if (!shot.scene)
        throw Error("This shot has no scene; supply a candidate scene");
      if (name === "check_preview")
        return { content: [text(await this.pipeline.verify(p, [shot]))] };
      const duration = shot.end - shot.start;
      const times =
        name === "measure_layout"
          ? [args.time ?? duration / 2]
          : (args.times ?? [
              Math.min(0.01, duration / 2),
              duration / 2,
              Math.max(0, duration - 0.04),
            ]);
      if (
        !Array.isArray(times) ||
        !times.length ||
        times.length > 3 ||
        times.some((t) => !Number.isFinite(t) || t < 0 || t >= duration)
      )
        throw Error("Supply 1–3 times inside the shot duration");
      const vertical = p.format === "9:16";
      const width = vertical ? 540 : 960,
        height = vertical ? 960 : 540;
      const browser = await this.pipeline.browserInstance();
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.goto(
          `${this.pipeline.base}/player.html?width=${width}&height=${height}`,
        );
        await page.waitForFunction(() => window.ready);
        await page.evaluate((project) => window.FC.setProject(project), p);
        const content = [];
        for (const time of times) {
          const metrics = await page.evaluate(
            (t) => window.FC.renderFrame(t),
            shot.start + time,
          );
          content.push(text({ shotId: shot.id, time, ...metrics }));
          if (name === "measure_layout") {
            const labels = metrics.metrics.filter(
              (m) => m.type === "text" && m.bounds && m.visible,
            );
            const overlaps = [];
            for (let i = 0; i < labels.length; i++)
              for (let j = i + 1; j < labels.length; j++) {
                const a = labels[i].bounds,
                  b = labels[j].bounds;
                if (
                  a.left < b.right &&
                  a.right > b.left &&
                  a.top < b.bottom &&
                  a.bottom > b.top
                )
                  overlaps.push([labels[i].id, labels[j].id]);
              }
            content.push(text({ textOverlapCandidates: overlaps }));
          } else
            content.push({
              type: "image",
              mimeType: "image/png",
              data: (await page.screenshot()).toString("base64"),
            });
        }
        return { content };
      } finally {
        await page.close();
      }
    } finally {
      release();
    }
  }
}

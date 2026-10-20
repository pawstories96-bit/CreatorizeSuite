import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  Store,
  styles,
  uid,
  atomic,
  read,
  run,
  safePath,
  validateWords,
  validateScene,
  validateStyleParams,
  validateCast,
  topo,
  allowedLicense,
} from "./core.mjs";
import { AgentRunner, Vault, cliPath } from "./agents.mjs";
import { ModelCatalog } from "./model-catalog.mjs";
import { normalizeAgent } from "./agent-routing.mjs";
import { Pipeline } from "./pipeline.mjs";
import { integrations } from "./integrations.mjs";
import { assetRoutes } from "./assets.mjs";
import { AgentTools } from "./agent-tools.mjs";
import { watchScenes } from "./scene-watch.mjs";
import { validateTimeline } from "./timeline.mjs";
import { savedJobError } from "./provider-errors.mjs";
import { stylePreview } from "./style-previews.mjs";
import { analyzeSilence } from "./audio-edits.mjs";
import { inspectReference } from "./references.mjs";
import { validateScriptSettings } from "./script-rules.mjs";
import { workflowStages } from "../public/lib/workflow.js";
import { activeWorkspace, inWorkspace, workspaceList } from "./workspaces.mjs";
import { styleModule } from "./style-training.mjs";
import { validateSchedule, runSchedules } from "./schedules.mjs";
import { queueAudienceLearning } from "./learning.mjs";
import { searchModels, downloadModel } from "./models.mjs";
import { fetchMap } from "./maps.mjs";
import { imageCatalog } from "./cloud-images.mjs";
import { FlowBridge } from "./flow-bridge.mjs";
import { cameraMoves } from "../public/lib/cameras.js";
import { castRole, defaultCast } from "../public/lib/cast.js";
import { legacyFBX, convertLegacyFBX } from "./rig-converter.mjs";
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function startServer(options = {}) {
  const root =
    options.root ||
    process.env.CREATORIZE_WORKSPACE ||
    process.env.FRAMECRAFT_WORKSPACE ||
    path.join(appRoot, ".workspace");
  const store = await new Store().init(root),
    vault = new Vault(root);
  store.flowBridge = new FlowBridge(store);
  if (options.safeStorage) vault.safeStorage = options.safeStorage;
  const agents = new AgentRunner(store, vault),
    pipeline = new Pipeline(store, agents, vault);
  const agentTools = new AgentTools(store, pipeline);
  agents.toolBridge = agentTools;
  const modelCatalog = new ModelCatalog(store, vault, cliPath);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "25mb" }));
  let base = "";
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const host = req.headers.host;
    if (host && !/^127\.0\.0\.1:\d+$/.test(host))
      return res.status(403).json({ error: "Local access only" });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== base
    )
      return res
        .status(403)
        .json({ error: "Requests must originate from the local application" });
    next();
  });
  const upload = multer({
    dest: path.join(root, "incoming"),
    limits: { fileSize: 1024 * 1024 * 1024 },
  });
  const route = (method, url, handler) =>
    app[method](url, async (req, res, next) => {
      try {
        await handler(req, res);
      } catch (e) {
        next(e);
      }
    });
  route("post", "/api/agent-tools", async (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    res.json(await agentTools.call(token, req.body.name, req.body.arguments));
  });
  route("get", "/api/state", async (req, res) =>
    res.json({
      projects: inWorkspace(store, store.all("projects"))
        .map((p) => ({
          ...p,
          agent: store.get("projectAgents", p.id)?.agent || null,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      jobs: store
        .all("jobs")
        .filter(
          (j) =>
            ["test", "calibrate"].includes(j.action) ||
            (j.workspaceId ||
              (j.projectId
                ? store.get("projects", j.projectId)?.workspaceId
                : null) ||
              "personal") === activeWorkspace(store),
        )
        .map((j) => ({ ...j, displayError: savedJobError(j) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      channels: inWorkspace(store, store.all("channels")),
      memory: store.all("memory"),
      memoryProposals: store.all("memoryProposals"),
      styles: [...styles, ...store.all("styles")],
      routines: inWorkspace(store, store.all("routines")),
      thumbnails: store
        .all("thumbnails")
        .filter(
          (t) =>
            (store.get("projects", t.projectId)?.workspaceId || "personal") ===
            activeWorkspace(store),
        ),
      boards: store
        .all("boards")
        .filter(
          (b) =>
            (b.workspaceId ||
              store.get("projects", b.projectId)?.workspaceId ||
              "personal") === activeWorkspace(store),
        ),
      uploads: store.all("uploads").map(({ location, ...record }) => record),
      learnings: store.all("learnings"),
      settings: {
        ...store.settings(),
        calibrations: store.all("calibrations"),
        vault: {
          apiKey: vault.has("apiKey"),
          anthropicKey: vault.has("anthropicKey"),
          elevenlabs: vault.has("elevenlabs"),
          imageKey: vault.has("imageKey"),
          falKey: vault.has("falKey"),
          higgsfieldKey: vault.has("higgsfieldKey"),
          google: vault.has("googleTokens"),
        },
      },
      workspace: root,
      activeWorkspace: activeWorkspace(store),
      workspaces: workspaceList(store),
      catalogs: store.all("catalogs"),
      characters: inWorkspace(store, store.all("characters")),
    }),
  );
  route("get", "/api/styles/:id/preview", async (req, res) => {
    const style = styles.find((s) => s.id === req.params.id);
    if (!style) throw Error("Unknown built-in style");
    const look = style.looks.includes(req.query.look)
      ? req.query.look
      : style.look;
    res.json(stylePreview(style.id, look));
  });
  route("get", "/api/styles/:id/module", async (req, res) => {
    const style = store.get("styles", req.params.id);
    if (!style) throw Error("Custom style not found");
    res.type("application/javascript").send(styleModule(style));
  });
  route("get", "/api/characters/:id/preview", async (req, res) => {
    const character = store.get("characters", req.params.id);
    if (!character) throw Error("Character not found");
    const element = {
      ...character.element,
      x: 640,
      y: 365,
      width: 320,
      height: 470,
      pose: ["idle", "walk", "run", "point", "sit"].includes(req.query.pose)
        ? req.query.pose
        : "idle",
    };
    res.json({
      id: "character-preview",
      style: character.style,
      format: "16:9",
      durationSec: 8,
      shots: [
        {
          id: "rig-preview",
          start: 0,
          end: 8,
          scene: validateScene({ background: "#e8e7de", elements: [element] }),
        },
      ],
    });
  });
  route(
    "post",
    "/api/projects/:id/characters/:character/insert",
    async (req, res) => {
      const p = store.project(req.params.id),
        character = store.get("characters", req.params.character);
      if (!character) throw Error("Character not found");
      if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
        throw Error("Stop the active job before inserting a character");
      const shot = p.shots.find((s) => s.id === req.body.shotId);
      if (!shot?.scene) throw Error("Choose a built shot for the character");
      const element = {
        ...character.element,
        id: `character-${uid()}`,
        x: p.format === "9:16" ? 360 : 640,
        y: p.format === "9:16" ? 860 : 450,
        width: 260,
        height: 350,
      };
      shot.scene = validateScene({
        ...shot.scene,
        elements: [...shot.scene.elements, element],
      });
      p.lastExport = null;
      p.pipeline.exported = "pending";
      store.saveProject(p);
      atomic(
        path.join(store.projectDir(p.id), "scenes", shot.id + ".json"),
        shot.scene,
      );
      atomic(
        path.join(store.projectDir(p.id), "scenes", shot.id + ".js"),
        `export default ${JSON.stringify(shot.scene)};\n`,
      );
      await store.commit(p.id, "Insert rigged character " + character.name);
      res.json(p);
    },
  );
  route("post", "/api/workspaces", async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 80)
      throw Error("Name your workspace using 1–80 characters");
    res.json(
      store.put("workspaces", {
        id: uid(),
        name,
        createdAt: new Date().toISOString(),
      }),
    );
  });
  route("post", "/api/catalogs", async (req, res) => {
    res.json(
      pipeline.enqueue(null, "catalog", {
        url: req.body.url,
        limit: req.body.limit,
        dates: req.body.dates === true,
        refresh: req.body.refresh === true,
      }),
    );
  });
  route("get", "/api/model-assets", async (req, res) =>
    res.json(await searchModels(store, req.query.q)),
  );
  route("post", "/api/projects/:id/maps", async (req, res) =>
    res.json(await fetchMap(store, store.project(req.params.id), req.body)),
  );
  route("post", "/api/projects/:id/maps/apply", async (req, res) => {
    const p = store.project(req.params.id);
    if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
      throw Error("Stop the active job before applying a map scene");
    if (!/^assets\/map-[a-f0-9]+\.scene\.json$/.test(req.body.path || ""))
      throw Error("Choose an imported map scene");
    const record = read(safePath(store.projectDir(p.id), req.body.path));
    const shot = p.shots.find((s) => s.id === req.body.shotId);
    if (!shot || !record?.scene) throw Error("Choose a shot and imported map");
    shot.scene = validateScene(record.scene);
    shot.status = "built";
    p.lastExport = null;
    p.pipeline.exported = "pending";
    store.saveProject(p);
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".json"),
      shot.scene,
    );
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".js"),
      `export default ${JSON.stringify(shot.scene)};\n`,
    );
    await store.commit(p.id, "Apply geographic map scene");
    res.json(p);
  });
  route("post", "/api/projects/:id/models", async (req, res) =>
    res.json(
      await downloadModel(
        store,
        store.project(req.params.id),
        String(req.body.id || ""),
      ),
    ),
  );
  route("post", "/api/workspaces/:id/select", async (req, res) => {
    if (!workspaceList(store).some((w) => w.id === req.params.id))
      throw Error("Workspace not found");
    store.put("settings", {
      ...store.settings(),
      id: "app",
      activeWorkspace: req.params.id,
    });
    res.json({ ok: true });
  });
  route("get", "/api/projects/:id", async (req, res) =>
    res.json({
      ...store.project(req.params.id),
      agent: store.get("projectAgents", req.params.id)?.agent || null,
    }),
  );
  route("post", "/api/projects/:id/agent", async (req, res) => {
    store.project(req.params.id);
    const agent = normalizeAgent(req.body.agent);
    store.put("projectAgents", { id: req.params.id, agent });
    res.json({ agent });
  });
  route("post", "/api/projects/:id/silence/analyze", async (req, res) => {
    res.json(
      await analyzeSilence(store, store.project(req.params.id), req.body),
    );
  });
  route("post", "/api/projects/:id/reference-info", async (req, res) => {
    res.json(
      await inspectReference(store, store.project(req.params.id), {
        ...req.body,
        label: "Reference",
      }),
    );
  });
  route("post", "/api/projects/:id/kanban", async (req, res) => {
    if (!workflowStages.includes(req.body.stage))
      throw Error("Choose one of the eight channel stages");
    const p = store.project(req.params.id);
    if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
      throw Error("Wait for the active job before moving its channel card");
    p.kanbanStage = req.body.stage;
    p.status = {
      idea: "draft",
      script: "draft",
      voiceover: "draft",
      building: "editing",
      review: "editing",
      ready: "ready",
      scheduled: "scheduled",
      published: "published",
    }[req.body.stage];
    store.saveProject(p);
    await store.commit(p.id, "Move channel card to " + req.body.stage);
    res.json(p);
  });
  route("post", "/api/projects/:id/script-settings", async (req, res) => {
    const p = store.project(req.params.id);
    if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
      throw Error("Stop the active job before changing scripting rules");
    p.scriptSettings = validateScriptSettings(req.body);
    if (req.body.removeSkill === true) delete p.scriptingSkill;
    store.saveProject(p);
    await store.commit(p.id, "Update scripting methodology and rules");
    res.json(p);
  });
  app.post(
    "/api/projects/:id/scripting-skill",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const p = store.project(req.params.id);
        if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
          throw Error("Stop the active job before changing scripting skills");
        if (
          !req.file ||
          !/\.(md|txt)$/i.test(req.file.originalname) ||
          req.file.size > 131072
        )
          throw Error("Choose a .md or .txt scripting skill up to 128 KB");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          fs.readFileSync(req.file.path),
        );
        if (!text.trim() || text.includes("\0"))
          throw Error("Choose a nonempty UTF-8 text file");
        p.scriptingSkill = {
          name: path.basename(req.file.originalname),
          text,
          uploadedAt: new Date().toISOString(),
        };
        store.saveProject(p);
        await store.commit(p.id, "Load custom scripting skill");
        res.json(p.scriptingSkill);
      } catch (e) {
        next(e);
      } finally {
        if (req.file) fs.unlinkSync(req.file.path);
      }
    },
  );
  route("post", "/api/projects/:id/references", async (req, res) => {
    const p = store.project(req.params.id);
    if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
      throw Error("Stop the active job before changing references");
    if ((p.references || []).length >= 10)
      throw Error("Use at most ten technique references per project");
    pipeline.externalLocks.add(p.id);
    try {
      const ref = await inspectReference(store, p, req.body);
      p.references = [...(p.references || []), ref];
      store.saveProject(p);
      await store.commit(p.id, "Add technique reference: " + ref.label);
      res.json(ref);
    } finally {
      pipeline.externalLocks.delete(p.id);
      pipeline.pump();
    }
  });
  route(
    "delete",
    "/api/projects/:id/references/:reference",
    async (req, res) => {
      const p = store.project(req.params.id);
      if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
        throw Error("Stop the active job before changing references");
      p.references = (p.references || []).filter(
        (r) => r.id !== req.params.reference,
      );
      store.saveProject(p);
      await store.commit(p.id, "Remove technique reference");
      res.json(p);
    },
  );
  route("post", "/api/projects/:id/timeline", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      pipeline.externalLocks.has(p.id) ||
      [...pipeline.active.values()].some((j) => j.projectId === p.id)
    )
      throw Error("Stop the active job before changing the timeline");
    const timeline = validateTimeline(req.body, p, store.projectDir(p.id));
    pipeline.externalLocks.add(p.id);
    try {
      if (
        JSON.stringify(timeline.audio) !==
        JSON.stringify(p.timeline?.audio || [])
      ) {
        p.mix = null;
        p.pipeline.soundDesign = "pending";
      }
      p.timeline = timeline;
      p.lastExport = null;
      p.pipeline.exported = "pending";
      store.saveProject(p);
      await store.commit(p.id, "Edit cues, cards and sound timeline");
      res.json(p);
    } finally {
      pipeline.externalLocks.delete(p.id);
      pipeline.pump();
    }
  });
  route("post", "/api/memory-proposals/:id/:action", async (req, res) => {
    const proposal = store.get("memoryProposals", req.params.id);
    if (!proposal) throw Error("Proposal not found");
    if (!["approve", "dismiss"].includes(req.params.action))
      throw Error("Choose approve or dismiss");
    if (req.params.action === "approve")
      store.put("memory", {
        ...proposal,
        approvedAt: new Date().toISOString(),
      });
    store.remove("memoryProposals", proposal.id);
    res.json({ ok: true });
  });
  route("get", "/api/models/:provider", async (req, res) => {
    res.json(
      await modelCatalog.list(req.params.provider, {
        refresh: req.query.refresh === "true",
        endpoint: req.query.endpoint,
      }),
    );
  });
  route("post", "/api/projects", async (req, res) =>
    res.status(201).json(await store.create(req.body)),
  );
  route("patch", "/api/projects/:id", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      ([...pipeline.active.values()].some((j) => j.projectId === p.id) ||
        pipeline.externalLocks.has(p.id)) &&
      Object.keys(req.body).some((k) => k !== "notes")
    )
      throw Error(
        "Wait for the active job to finish or stop it before changing project files",
      );
    const allowed = [
      "title",
      "topic",
      "direction",
      "style",
      "look",
      "format",
      "language",
      "targetLengthSec",
      "channelId",
      "notes",
      "metadata",
      "status",
    ];
    if ("styleParams" in req.body) {
      p.styleParams = validateStyleParams(req.body.styleParams);
      p.lastExport = null;
      p.pipeline.exported = "pending";
    }
    if ("cast" in req.body) {
      const cast = validateCast(req.body.cast);
      for (const choice of Object.values(cast))
        if (
          choice.src &&
          !fs.existsSync(safePath(store.projectDir(p.id), choice.src))
        )
          throw Error("Import the character GLB into this project first");
      p.cast = cast;
      p.visionQA = "pending";
      for (const shot of p.shots) delete shot.visionQA;
      p.lastExport = null;
      p.pipeline.exported = "pending";
      p.needsReview = true;
    }
    if ("castMode" in req.body) {
      if (!["mixamo", "procedural"].includes(req.body.castMode))
        throw Error("Choose Mixamo or procedural characters");
      p.castMode = req.body.castMode;
      p.visionQA = "pending";
      for (const shot of p.shots) delete shot.visionQA;
      p.lastExport = null;
      p.pipeline.exported = "pending";
      p.needsReview = true;
    }
    for (const k of allowed) if (k in req.body) p[k] = req.body[k];
    if ("script" in req.body && req.body.script !== p.script) {
      p.script = String(req.body.script);
      p.pipeline.script = p.script.trim() ? "done" : "pending";
      for (const k of [
        "voiceover",
        "audioCleaned",
        "wordsTimed",
        "storyboard",
        "scenes",
        "soundDesign",
        "exported",
      ])
        p.pipeline[k] = "pending";
      p.words = [];
      p.shots = [];
      p.audio = null;
      p.mix = null;
      p.lastExport = null;
      p.durationSec = 0;
      atomic(path.join(store.projectDir(p.id), "script.txt"), p.script);
    }
    if ("research" in req.body) {
      p.research = String(req.body.research);
      atomic(path.join(store.projectDir(p.id), "research.md"), p.research);
    }
    store.saveProject(p);
    await store.commit(p.id, "Save project changes");
    res.json(p);
  });
  route("post", "/api/projects/:id/update-engine", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      [...pipeline.active.values()].some((j) => j.projectId === p.id) ||
      pipeline.externalLocks.has(p.id)
    )
      throw Error("Stop the active job before updating the character engine");
    const cast = { ...defaultCast, ...p.cast };
    for (const shot of p.shots) {
      if (!shot.scene) continue;
      shot.scene = validateScene(shot.scene);
      for (const e of shot.scene.elements)
        if (e.type === "mannequin") {
          e.castRole = castRole(e);
          if (!p.cast?.[e.castRole])
            cast[e.castRole] = {
              body: e.body,
              finish: p.look === "Investigation" ? "glossy" : e.finish,
              color:
                {
                  actor: "#ef4444",
                  protagonist: "#3b82f6",
                  bystander: "#67e8f9",
                }[e.role] ||
                (/^#[0-9a-f]{6}$/i.test(e.fill) ? e.fill : "#eff0ef"),
            };
        }
      delete shot.visionQA;
      atomic(
        path.join(store.projectDir(p.id), "scenes", shot.id + ".json"),
        shot.scene,
      );
      atomic(
        path.join(store.projectDir(p.id), "scenes", shot.id + ".js"),
        `export default ${JSON.stringify(shot.scene, null, 2)};\n`,
      );
    }
    p.cast = validateCast(cast);
    p.engineVersion = 3;
    p.visionQA = "pending";
    p.needsReview = true;
    p.lastExport = null;
    p.pipeline.exported = "pending";
    store.saveProject(p);
    await store.commit(
      p.id,
      "Update character engine and preserve role colors",
    );
    res.json(p);
  });
  route("post", "/api/projects/:id/actor-action", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      [...pipeline.active.values()].some((j) => j.projectId === p.id) ||
      pipeline.externalLocks.has(p.id)
    )
      throw Error("Stop the active job before changing character actions");
    const shot = p.shots.find((s) => s.id === req.body.shotId);
    if (!shot?.scene) throw Error("Choose a built shot");
    let changed = 0;
    if (
      req.body.motionSrc &&
      !(p.motions || []).some((m) => m.path === req.body.motionSrc)
    )
      throw Error("Choose an imported project motion");
    shot.scene = validateScene({
      ...shot.scene,
      elements: shot.scene.elements.map((e) => {
        if (e.type !== "mannequin" || castRole(e) !== req.body.role) return e;
        changed++;
        return {
          ...e,
          pose: req.body.pose,
          heldProp: req.body.heldProp || undefined,
          motionSrc: req.body.motionSrc || undefined,
        };
      }),
    });
    if (!changed)
      throw Error("This role has no built-in mannequin in the current shot");
    delete shot.visionQA;
    p.visionQA = "pending";
    p.needsReview = true;
    p.lastExport = null;
    p.pipeline.exported = "pending";
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".json"),
      shot.scene,
    );
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".js"),
      `export default ${JSON.stringify(shot.scene, null, 2)};\n`,
    );
    store.saveProject(p);
    await store.commit(p.id, "Set character action in " + shot.id);
    res.json(p);
  });
  route("post", "/api/projects/:id/camera", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      [...pipeline.active.values()].some((j) => j.projectId === p.id) ||
      pipeline.externalLocks.has(p.id)
    )
      throw Error("Stop the active job before changing the camera");
    const shot = p.shots.find((s) => s.id === req.body.shotId);
    if (!shot?.scene) throw Error("Choose a built shot");
    if (!cameraMoves.some(([id]) => id === req.body.preset))
      throw Error("Choose a named camera move");
    const target = shot.scene.cameraRig?.target || { x: 0, y: 1, z: 0 },
      from = shot.scene.camera || { x: 12, y: 10, z: 18 },
      dx = from.x - target.x,
      dz = from.z - target.z;
    shot.scene = validateScene({
      ...shot.scene,
      cameraRig: {
        type: "dolly",
        preset: req.body.preset,
        target,
        distance: Math.max(0.5, Math.hypot(dx, dz)),
        height: from.y - target.y,
        azimuth: (Math.atan2(dx, dz) * 180) / Math.PI,
        duration: shot.end - shot.start,
        easing: "smooth",
      },
    });
    delete shot.visionQA;
    p.visionQA = "pending";
    p.needsReview = true;
    p.lastExport = null;
    p.pipeline.exported = "pending";
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".json"),
      shot.scene,
    );
    atomic(
      path.join(store.projectDir(p.id), "scenes", shot.id + ".js"),
      `export default ${JSON.stringify(shot.scene, null, 2)};\n`,
    );
    store.saveProject(p);
    await store.commit(p.id, "Apply camera move: " + req.body.preset);
    res.json(p);
  });
  route("post", "/api/projects/:id/duplicate", async (req, res) => {
    const original = store.project(req.params.id),
      p = await store.create({
        ...original,
        title: original.title + " (copy)",
      });
    const src = store.projectDir(original.id),
      dest = store.projectDir(p.id);
    for (const name of ["audio", "scenes", "assets", "sound"])
      fs.cpSync(path.join(src, name), path.join(dest, name), {
        recursive: true,
      });
    const cloned = {
      ...original,
      id: p.id,
      title: p.title,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      lastExport: null,
      status: original.shots.length ? "editing" : "draft",
    };
    store.saveProject(cloned);
    const preference = store.get("projectAgents", original.id);
    if (preference)
      store.put("projectAgents", { id: p.id, agent: preference.agent });
    await store.commit(p.id, "Duplicate project");
    res.json(cloned);
  });
  route("delete", "/api/projects/:id", async (req, res) => {
    const p = store.project(req.params.id);
    if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
      throw Error("Stop the running job before deleting the project");
    const from = store.projectDir(p.id),
      to = safePath(path.join(root, "trash"), p.id + "-" + Date.now());
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    store.remove("projects", p.id);
    res.json({ ok: true, recoverableAt: to });
  });
  route("get", "/api/projects/:id/zip", async (req, res) => {
    const p = store.project(req.params.id),
      zip = new AdmZip();
    zip.addLocalFolder(
      store.projectDir(p.id),
      undefined,
      (f) => !f.includes(".git" + path.sep) && !f.startsWith(".git/"),
    );
    zip.updateFile(
      "project.json",
      Buffer.from(
        JSON.stringify(
          { ...p, agent: store.get("projectAgents", p.id)?.agent || null },
          null,
          2,
        ),
      ),
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="project-${p.id}.zip"`,
    );
    res.type("application/zip").send(zip.toBuffer());
  });
  app.post("/api/import", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) throw Error("Choose a project ZIP");
      const zip = new AdmZip(req.file.path);
      let entries = zip.getEntries(),
        manifest =
          entries.find((e) => e.entryName === "project.json") ||
          entries.find((e) => e.entryName.endsWith("/project.json"));
      if (!manifest) throw Error("ZIP must contain project.json");
      const prefix = manifest.entryName.slice(0, -12),
        data = JSON.parse(manifest.getData().toString("utf8"));
      const p = await store.create({
          ...data,
          workspaceId: activeWorkspace(store),
        }),
        dest = store.projectDir(p.id);
      let size = 0;
      for (const entry of entries) {
        if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
        const rel = entry.entryName.slice(prefix.length);
        if (rel.startsWith(".git") || rel === "project.json") continue;
        size += entry.header.size;
        if (size > 2 * 1024 ** 3) throw Error("Expanded archive exceeds 2 GB");
        const target = safePath(dest, rel);
        atomic(target, entry.getData());
      }
      const imported = {
        ...p,
        ...data,
        id: p.id,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        workspaceId: p.workspaceId,
      };
      imported.shots = (imported.shots || []).map((s) => ({
        ...s,
        scene: s.scene ? validateScene(s.scene) : null,
      }));
      if (imported.shots.some((s) => !/^[\w-]{1,100}$/.test(s.id)))
        throw Error("Invalid shot ID in imported project");
      const agent = normalizeAgent(imported.agent);
      if (imported.styleDefinition) {
        const custom = imported.styleDefinition;
        if (
          !styles.some((s) => s.id === custom.baseStyle) ||
          typeof custom.name !== "string" ||
          (custom.guide != null &&
            (typeof custom.guide !== "string" || custom.guide.length > 16000))
        )
          throw Error("Invalid custom style in project archive");
        const checked = validateScene({
          effects: custom.sceneDefaults?.effects || {},
          elements: [{ id: "style-check", type: "circle", radius: 1 }],
        });
        const restored = {
          ...custom,
          id: uid(),
          sceneDefaults: { effects: checked.effects },
          updatedAt: new Date().toISOString(),
        };
        store.put("styles", restored);
        imported.style = restored.id;
        imported.styleDefinition = restored;
      }
      if (
        imported.channelId &&
        !inWorkspace(store, store.all("channels")).some(
          (c) => c.id === imported.channelId,
        )
      )
        imported.channelId = null;
      delete imported.agent;
      store.put("projectAgents", { id: p.id, agent });
      if (imported.audio) safePath(dest, imported.audio);
      if (imported.mix) safePath(dest, imported.mix);
      if (imported.thumbnail) safePath(dest, imported.thumbnail);
      store.saveProject(imported);
      await store.commit(p.id, "Import project");
      res.json(imported);
    } catch (e) {
      next(e);
    } finally {
      if (req.file) fs.unlinkSync(req.file.path);
    }
  });
  app.post(
    "/api/projects/:id/audio",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const p = store.project(req.params.id);
        if (!req.file) throw Error("Choose an audio file");
        if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
          throw Error("Stop the active job before replacing narration");
        const dest = path.join(
          store.projectDir(p.id),
          "audio",
          "voiceover.original.wav",
        );
        await run(
          "ffmpeg",
          ["-y", "-i", req.file.path, "-vn", "-ar", "48000", "-ac", "1", dest],
          { timeout: 1800000 },
        );
        p.durationSec = await pipeline.duration(dest);
        p.audio = "audio/voiceover.original.wav";
        p.words = [];
        p.shots = [];
        p.mix = null;
        p.lastExport = null;
        p.pipeline.voiceover = "done";
        for (const k of [
          "audioCleaned",
          "wordsTimed",
          "storyboard",
          "scenes",
          "soundDesign",
          "exported",
        ])
          p.pipeline[k] = "pending";
        store.saveProject(p);
        res.json(p);
      } catch (e) {
        next(e);
      } finally {
        if (req.file) fs.unlinkSync(req.file.path);
      }
    },
  );
  app.post(
    "/api/projects/:id/camera",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const p = store.project(req.params.id);
        if (
          !req.file ||
          !/\.(mp4|mov|mkv|webm|m4v)$/i.test(req.file.originalname)
        )
          throw Error("Choose a camera video file");
        if ([...pipeline.active.values()].some((j) => j.projectId === p.id))
          throw Error("Stop the active job before replacing camera footage");
        const source = `assets/camera-source-${uid()}${path.extname(req.file.originalname).toLowerCase()}`;
        fs.copyFileSync(
          req.file.path,
          path.join(store.projectDir(p.id), source),
        );
        res.json(pipeline.enqueue(p.id, "prepare-camera", { source }));
      } catch (error) {
        next(error);
      } finally {
        if (req.file) fs.rmSync(req.file.path, { force: true });
      }
    },
  );
  route("post", "/api/projects/:id/words", async (req, res) => {
    const p = store.project(req.params.id);
    p.words = validateWords(req.body.words, p.durationSec || Infinity);
    p.pipeline.wordsTimed = "done";
    p.timingSource = "Imported word timestamps";
    atomic(path.join(store.projectDir(p.id), "audio", "words.json"), p.words);
    store.saveProject(p);
    res.json(p);
  });
  route("post", "/api/projects/:id/jobs", async (req, res) => {
    if (
      ![
        "script",
        "tts",
        "clean",
        "trim",
        "time",
        "storyboard",
        "build",
        "edit",
        "ultra",
        "analyze-reference",
        "train-style",
        "script-rules",
        "character",
        "analyze-takes",
        "apply-takes",
        "qa",
        "mix",
        "export",
        "thumbnail",
        "thumbnail-helper",
        "metadata",
        "trailer",
        "notify",
      ].includes(req.body.action)
    )
      throw Error("Unsupported job");
    res
      .status(202)
      .json(
        pipeline.enqueue(
          req.params.id,
          req.body.action,
          req.body.options || {},
        ),
      );
  });
  route("post", "/api/jobs/:id/:action", async (req, res) => {
    const { id, action } = req.params;
    if (action === "stop") pipeline.stop(id);
    else if (action === "retry") pipeline.resume(id);
    else if (action === "approve") {
      const j = store.get("jobs", id);
      if (!j || j.action !== "routine" || j.status !== "waiting")
        throw Error("This job is not waiting for approval");
      if (j.waitingChild) {
        const child = store.get("jobs", j.waitingChild);
        if (!child || child.status !== "waiting" || child.budgetBlocked)
          throw Error("The waiting topic needs attention before approval");
        child.approvedCheckpoints = [
          ...(child.approvedCheckpoints || []),
          child.checkpoint,
        ];
        store.put("jobs", child);
        delete j.waitingChild;
        store.put("jobs", j);
        pipeline.resume(id);
        res.json({ ok: true });
        return;
      }
      if (j.budgetBlocked)
        throw Error(
          "This run is waiting at a budget checkpoint, not an upload approval. Update the routine limit and retry.",
        );
      j.approvedCheckpoints = [...(j.approvedCheckpoints || []), j.checkpoint];
      store.put("jobs", j);
      pipeline.resume(id);
    } else throw Error("Unknown job action");
    res.json({ ok: true });
  });
  route("get", "/api/projects/:id/history", async (req, res) => {
    const result = await run(
      "git",
      ["log", "--format=%H%x09%aI%x09%s", "-50"],
      { cwd: store.projectDir(req.params.id) },
    );
    res.json(
      result.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, date, message] = line.split("\t");
          return { hash, date, message };
        }),
    );
  });
  route("get", "/api/projects/:id/diff/:hash", async (req, res) => {
    if (!/^[a-f0-9]{40}$/.test(req.params.hash)) throw Error("Invalid commit");
    const r = await run("git", ["show", "--stat", "--patch", req.params.hash], {
      cwd: store.projectDir(req.params.id),
    });
    res.json({ diff: r.stdout });
  });
  route("post", "/api/projects/:id/revert", async (req, res) => {
    if (
      [...pipeline.active.values()].some((j) => j.projectId === req.params.id)
    )
      throw Error("Stop the active job before reverting");
    const hash = req.body.hash;
    if (!/^[a-f0-9]{40}$/.test(hash)) throw Error("Invalid commit");
    if (pipeline.externalLocks.has(req.params.id))
      throw Error("Project history is already being updated");
    pipeline.externalLocks.add(req.params.id);
    try {
      const cwd = store.projectDir(req.params.id);
      const dirty = await run(
        "git",
        ["status", "--porcelain", "--untracked-files=no"],
        { cwd },
      );
      if (dirty.stdout.trim())
        await store.commit(
          req.params.id,
          "Save current project state before revert",
        );
      try {
        await run("git", ["revert", "--no-edit", hash], { cwd });
      } catch (e) {
        await run("git", ["revert", "--abort"], { cwd }).catch(() => {});
        throw Error(
          "This change conflicts with newer edits. No files were reverted. " +
            e.message,
        );
      }
      const p = read(path.join(cwd, "project.json"));
      if (!p) throw Error("Project snapshot is missing");
      // Keep the restored file exactly equal to the Git commit. Rewriting its
      // timestamp here would immediately dirty it and break undoing this revert.
      store.put("projects", p);
      res.json(p);
    } finally {
      pipeline.externalLocks.delete(req.params.id);
      pipeline.pump();
    }
  });
  route("post", "/api/settings", async (req, res) => {
    const previous = store.settings();
    const data = { ...previous, ...req.body, id: "app" };
    delete data.vault;
    delete data.apiKey;
    delete data.anthropicKey;
    delete data.elevenlabs;
    for (const key of [
      "imageKey",
      "fish",
      "falKey",
      "higgsfieldKey",
      "googleClientId",
      "googleClientSecret",
    ])
      delete data[key];
    if (data.fallbacks) {
      for (const chain of Object.values(data.fallbacks)) {
        if (!Array.isArray(chain) || chain.length > 4)
          throw Error("Use at most four fallback models per role");
        chain.forEach(normalizeAgent);
      }
    }
    for (const price of Object.values(data.modelPrices || {})) {
      for (const value of Object.values(price))
        if (value != null && (!Number.isFinite(value) || value < 0))
          throw Error("Model prices must be nonnegative numbers");
    }
    store.put("settings", data);
    res.json(data);
  });
  route("get", "/api/ui-session", async (req, res) =>
    res.json(store.get("uiSession", "desktop") || null),
  );
  route("post", "/api/ui-session", async (req, res) => {
    const { page, activeId, collapsed } = req.body;
    if (
      ![
        "Home",
        "Projects",
        "Channels",
        "Editor",
        "Styles",
        "Memory",
        "Thumbnails",
        "Routines",
        "Renders",
        "Usage",
        "YouTube",
        "Connections",
        "Settings",
      ].includes(page) ||
      typeof activeId !== "string" ||
      activeId.length > 100 ||
      typeof collapsed !== "boolean"
    )
      throw Error("Invalid desktop session");
    res.json(
      store.put("uiSession", { id: "desktop", page, activeId, collapsed }),
    );
  });
  route("post", "/api/credentials", async (req, res) => {
    if (
      ![
        "apiKey",
        "anthropicKey",
        "elevenlabs",
        "fish",
        "imageKey",
        "falKey",
        "higgsfieldKey",
        "fish",
        "googleClientId",
        "googleClientSecret",
      ].includes(req.body.name)
    )
      throw Error("Unsupported credential");
    await vault.set(req.body.name, String(req.body.value || ""));
    res.json({ ok: true });
  });
  route("get", "/api/connections", async (req, res) =>
    res.json(await agents.detect()),
  );
  route("get", "/api/image-models", async (req, res) =>
    res.json(
      await imageCatalog(String(req.query.provider || ""), {
        query: String(req.query.q || ""),
        category: String(req.query.category || ""),
        cursor: String(req.query.cursor || ""),
        model: String(req.query.model || ""),
      }),
    ),
  );
  route("get", "/api/flow/status", async (req, res) =>
    res.json(await store.flowBridge.status()),
  );
  route("post", "/api/flow/open", async (req, res) =>
    res.json(await store.flowBridge.open()),
  );
  route("post", "/api/flow/close", async (req, res) => {
    if (store.flowBridge.busy)
      throw Error("Wait for the active Flow request to finish");
    await store.flowBridge.close();
    res.json({ ok: true });
  });
  route("post", "/api/connections/test", async (req, res) =>
    res.json(pipeline.enqueue(null, "test")),
  );
  route("post", "/api/connections/calibrate", async (req, res) =>
    res.json(pipeline.enqueue(null, "calibrate")),
  );
  route("get", "/api/hardware", async (req, res) => {
    let gpu = "Unknown",
      voices = [];
    if (process.platform === "win32") {
      try {
        const r = await run(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
          ],
          { timeout: 10000 },
        );
        gpu = r.stdout.trim();
      } catch {}
      try {
        const r = await run(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) | ConvertTo-Json",
          ],
          { timeout: 10000 },
        );
        const j = JSON.parse(r.stdout);
        voices = Array.isArray(j) ? j : [j];
      } catch {}
    }
    res.json({
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ramGB: Math.round(os.totalmem() / 1024 ** 3),
      platform: os.platform(),
      gpu,
      voices,
      whisperInstalled: fs.existsSync(
        path.join(root, "tools", "python", "Scripts", "python.exe"),
      ),
    });
  });
  route("post", "/api/open-folder", async (req, res) => {
    const target = req.body.projectId
      ? store.projectDir(req.body.projectId)
      : root;
    if (options.openPath) await options.openPath(target);
    else if (process.platform === "win32")
      await run("explorer.exe", [target]).catch(() => {});
    res.json({ ok: true, path: target });
  });
  for (const kind of [
    "memory",
    "channels",
    "styles",
    "routines",
    "thumbnails",
    "boards",
  ]) {
    route("post", "/api/" + kind, async (req, res) => {
      const value = {
        ...req.body,
        id: req.body.id || uid(),
        updatedAt: new Date().toISOString(),
      };
      if (["channels", "routines"].includes(kind))
        value.workspaceId =
          store.get(kind, value.id)?.workspaceId || activeWorkspace(store);
      if (kind === "boards")
        value.workspaceId = value.projectId
          ? store.project(value.projectId).workspaceId || "personal"
          : activeWorkspace(store);
      if (kind === "routines") topo(value.nodes || [], value.edges || []);
      if (kind === "routines")
        value.schedule = validateSchedule(value.schedule);
      if (
        kind === "routines" &&
        value.topicsPerRun != null &&
        (!Number.isInteger(value.topicsPerRun) ||
          value.topicsPerRun < 1 ||
          value.topicsPerRun > 10)
      )
        throw Error("Choose 1–10 topics per run");
      if (kind === "routines")
        for (const key of ["maxRunsPerDay", "maxCost"])
          if (
            value[key] != null &&
            (!Number.isFinite(value[key]) || value[key] < 0)
          )
            throw Error("Routine limits must be nonnegative numbers");
      if (kind === "memory" && !value.text?.trim())
        throw Error("Rule cannot be empty");
      if (kind === "channels" && !value.name?.trim())
        throw Error("Channel name cannot be empty");
      res.json(store.put(kind, value));
    });
    route("delete", "/api/" + kind + "/:id", async (req, res) => {
      store.remove(kind, req.params.id);
      res.json({ ok: true });
    });
  }
  route("post", "/api/routines/:id/run", async (req, res) => {
    const routine = store.get("routines", req.params.id);
    if (!routine) throw Error("Routine not found");
    if (!routine.nodes?.length) throw Error("Add steps to your routine");
    topo(routine.nodes, routine.edges);
    res.json(
      pipeline.enqueue(routine.projectId || null, "routine", {
        routineId: routine.id,
      }),
    );
  });
  route("get", "/api/assets/:id", async (req, res) =>
    res.json(
      read(
        path.join(
          store.projectDir(req.params.id),
          "assets",
          "ATTRIBUTIONS.json",
        ),
        [],
      ),
    ),
  );
  app.post(
    "/api/projects/:id/rig-import",
    upload.single("file"),
    async (req, res, next) => {
      let page,
        p,
        locked = false;
      try {
        p = store.project(req.params.id);
        if (
          [...pipeline.active.values()].some((j) => j.projectId === p.id) ||
          pipeline.externalLocks.has(p.id)
        )
          throw Error(
            "Stop the active job before importing characters or motions",
          );
        if (
          !req.file ||
          req.file.size > 150 * 1024 * 1024 ||
          !/\.(fbx|glb)$/i.test(req.file.originalname)
        )
          throw Error("Choose a self-contained FBX or GLB up to 150 MB");
        pipeline.externalLocks.add(p.id);
        locked = true;
        if (!["character", "motion"].includes(req.body.kind))
          throw Error("Choose a character or motion import");
        const character = req.body.kind === "character",
          name = String(
            req.body.name || path.parse(req.file.originalname).name,
          ).slice(0, 100),
          bytes = fs.readFileSync(req.file.path),
          hash = crypto.createHash("sha256").update(bytes).digest("hex"),
          cacheDir = path.join(store.root, "rig-cache"),
          cacheModel = path.join(cacheDir, hash + ".glb"),
          cacheMeta = character
            ? read(path.join(cacheDir, hash + ".json"), null)
            : null;
        let result;
        if (cacheMeta?.version === 1 && fs.existsSync(cacheModel))
          result = {
            ...cacheMeta,
            encoded: fs.readFileSync(cacheModel).toString("base64"),
          };
        else {
          const oldFBX =
              /\.fbx$/i.test(req.file.originalname) && legacyFBX(bytes),
            input = oldFBX
              ? await convertLegacyFBX(bytes, path.join(root, "incoming"))
              : bytes;
          const browser = await pipeline.browserInstance();
          page = await browser.newPage();
          await page.goto(pipeline.base + "/motion-import.html", {
            waitUntil: "domcontentloaded",
            timeout: 90000,
          });
          await page.waitForFunction(() => window.ready, null, {
            timeout: 90000,
          });
          result = await page.evaluate((data) => window.importRig(data), {
            encoded: input.toString("base64"),
            format: oldFBX
              ? "glb"
              : path.extname(req.file.originalname).slice(1).toLowerCase(),
            name,
            character,
          });
          if (character) {
            fs.mkdirSync(cacheDir, { recursive: true });
            atomic(cacheModel, Buffer.from(result.encoded, "base64"));
            atomic(path.join(cacheDir, hash + ".json"), {
              version: 1,
              bones: result.bones,
              clips: result.clips,
            });
          }
        }
        const rel = `assets/${hash.slice(0, 24)}${character ? ".glb" : ".motion.json"}`;
        if (character && (req.body.body || req.body.source === "mixamo")) {
          if (req.body.body && !["male", "female"].includes(req.body.body))
            throw Error("Choose male or female body");
          if (Object.keys(result.bones || {}).length < 12)
            throw Error(
              "This body needs a standard humanoid skeleton. Download the character With Skin from Mixamo.",
            );
        }
        if (character)
          fs.writeFileSync(
            safePath(store.projectDir(p.id), rel),
            Buffer.from(result.encoded, "base64"),
          );
        else atomic(safePath(store.projectDir(p.id), rel), result);
        const record = {
            path: rel,
            name,
            license: req.body.source === "mixamo" ? "Mixamo" : "user-owned",
            author: req.body.source === "mixamo" ? "Adobe / Mixamo" : "User",
            source:
              req.body.source === "mixamo"
                ? "https://www.mixamo.com/"
                : "Local " +
                  (character ? "character" : "animation") +
                  " import",
            retrievedAt: new Date().toISOString(),
            sourceHash: hash,
            ...(character && req.body.source === "mixamo"
              ? { humanoid: true }
              : {}),
            ...(character
              ? { skeleton: result.bones, clips: result.clips }
              : { duration: result.duration, mapping: result.mapping }),
          },
          ledgerPath = path.join(
            store.projectDir(p.id),
            "assets",
            "ATTRIBUTIONS.json",
          ),
          ledger = read(ledgerPath, []);
        atomic(ledgerPath, [...ledger.filter((a) => a.path !== rel), record]);
        if (!character) {
          p.motions = [
            ...(p.motions || []).filter((m) => m.path !== rel),
            record,
          ];
          store.saveProject(p);
          await store.commit(p.id, "Import humanoid motion: " + name);
        }
        if (character && req.body.body) {
          p.characterModels = {
            ...(p.characterModels || {}),
            [req.body.body]: record,
          };
          p.lastExport = null;
          p.pipeline.exported = "pending";
          p.visionQA = "pending";
          p.needsReview = true;
          for (const shot of p.shots) delete shot.visionQA;
          const workspaceId = p.workspaceId || "personal",
            storedPath = `character-bodies/${crypto.createHash("sha256").update(workspaceId).digest("hex").slice(0, 20)}/${hash.slice(0, 24)}.glb`,
            destination = safePath(store.root, storedPath);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(safePath(store.projectDir(p.id), rel), destination);
          store.put("characterBodies", {
            ...record,
            id: workspaceId + ":" + req.body.body,
            workspaceId,
            body: req.body.body,
            storedPath,
          });
          store.saveProject(p);
          await store.commit(p.id, "Import " + req.body.body + " Mixamo body");
        }
        await page?.close();
        page = null;
        pipeline.externalLocks.delete(p.id);
        locked = false;
        pipeline.pump();
        res.json(record);
      } catch (e) {
        next(e);
      } finally {
        await page?.close().catch(() => {});
        if (req.file) fs.unlinkSync(req.file.path);
        if (locked) {
          pipeline.externalLocks.delete(p.id);
          pipeline.pump();
        }
      }
    },
  );
  app.post(
    "/api/projects/:id/asset",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) throw Error("Choose a file");
        const p = store.project(req.params.id),
          license = req.body.license || "user-owned";
        if (!allowedLicense(license))
          throw Error("Asset license is not approved for automatic use");
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (
          ![
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".mp4",
            ".glb",
            ".wav",
            ".mp3",
            ".ogg",
            ".m4a",
          ].includes(ext)
        )
          throw Error("Use an image, audio, MP4 or GLB asset");
        const rel = `assets/${crypto.createHash("sha256").update(fs.readFileSync(req.file.path)).digest("hex").slice(0, 24)}${ext}`;
        fs.copyFileSync(req.file.path, path.join(store.projectDir(p.id), rel));
        const ledgerPath = path.join(
            store.projectDir(p.id),
            "assets",
            "ATTRIBUTIONS.json",
          ),
          ledger = read(ledgerPath, []);
        if (!ledger.some((a) => a.path === rel))
          ledger.push({
            path: rel,
            name: req.file.originalname,
            license,
            author: req.body.author || "User",
            source: req.body.source || "Local import",
            retrievedAt: new Date().toISOString(),
          });
        atomic(ledgerPath, ledger);
        res.json({ path: rel });
      } catch (e) {
        next(e);
      } finally {
        if (req.file) fs.unlinkSync(req.file.path);
      }
    },
  );
  app.use("/media/:id", (req, res, next) => {
    try {
      const rootDir = store.projectDir(req.params.id);
      const rel = decodeURIComponent(req.path).replace(/^\//, "");
      if (!/^(audio|assets|exports|sound)\//.test(rel))
        return res.sendStatus(403);
      const f = safePath(rootDir, rel);
      res.sendFile(f, { dotfiles: "allow" });
    } catch (e) {
      next(e);
    }
  });
  const integrationsRuntime = integrations(app, {
    store,
    vault,
    pipeline,
    getBase: () => base,
  });
  assetRoutes(app, store);
  app.use(
    "/three-addons",
    express.static(
      path.join(appRoot, "node_modules", "three", "examples", "jsm"),
    ),
  );
  app.use(
    "/vendor",
    express.static(path.join(appRoot, "node_modules", "three", "build")),
  );
  app.use(express.static(path.join(appRoot, "public")));
  const frontend = fs.existsSync(path.join(appRoot, "out", "index.html"))
    ? "out"
    : "dist";
  if (fs.existsSync(path.join(appRoot, frontend, "index.html"))) {
    app.use(express.static(path.join(appRoot, frontend)));
    app.get("/{*splat}", (req, res) =>
      res.sendFile(path.join(appRoot, frontend, "index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: appRoot,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.use((err, req, res, next) => {
    console.error(err.message);
    if (!res.headersSent) res.status(400).json({ error: err.message });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(
      options.port ?? Number(process.env.PORT || 4317),
      "127.0.0.1",
      () => resolve(s),
    );
  });
  base = `http://127.0.0.1:${server.address().port}`;
  pipeline.base = base;
  pipeline.recover();
  const sceneWatcher = watchScenes(store, pipeline);
  const timer = setInterval(() => {
    for (const j of store.all("jobs"))
      if (j.status === "paused" && j.nextRetryAt && j.nextRetryAt <= Date.now())
        pipeline.resume(j.id);
    runSchedules(store, pipeline);
    queueAudienceLearning(store, pipeline, vault);
  }, 15000);
  timer.unref();
  return {
    server,
    store,
    pipeline,
    vault,
    agentTools,
    modelCatalog,
    sceneWatcher,
    url: base,
    close: async () => {
      clearInterval(timer);
      sceneWatcher.close();
      integrationsRuntime.close();
      await store.flowBridge.close();
      pipeline.suspended = true;
      for (const j of pipeline.active.values()) {
        j.abort?.();
        j.status = "queued";
        pipeline.persist(j);
      }
      await Promise.allSettled([...pipeline.tasks.values()]);
      await pipeline.browser?.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = await startServer();
  console.log(`Creatorize Suite: ${service.url}`);
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import initSqlJs from "sql.js";
import { z } from "zod";

export const stages = [
  "script",
  "voiceover",
  "audioCleaned",
  "wordsTimed",
  "storyboard",
  "scenes",
  "soundDesign",
  "exported",
];
export const styles = [
  {
    id: "paint",
    name: "Sketchbook",
    look: "Paper & ink",
    description: "Expressive hand-drawn characters and playful visual stories.",
    color: "#ded3b3",
  },
  {
    id: "flat",
    name: "Flat explainer",
    look: "Bold & bright",
    description: "Clean shapes, expressive characters and clear ideas.",
    color: "#a8c9ee",
  },
  {
    id: "pixel",
    name: "Pixel art",
    look: "Crisp 640",
    description: "Small pixels. Big worlds. A cinematic retro aesthetic.",
    color: "#b6d5c1",
  },
  {
    id: "collage",
    name: "Editorial collage",
    look: "Broadsheet",
    description: "Cut-paper composition, bold type and textured storytelling.",
    color: "#e0be81",
  },
  {
    id: "3d",
    name: "3D reconstruction",
    look: "Studio",
    description:
      "Spatial storytelling with matte materials and cinematic cameras.",
    color: "#b9b8d9",
  },
];
export function uid() {
  return crypto.randomUUID();
}
export function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(
    tmp,
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : JSON.stringify(value, null, 2),
  );
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      break;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || i >= 30) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
}
export function read(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
export function safePath(root, relative) {
  const dest = path.resolve(root, relative);
  if (
    dest !== path.resolve(root) &&
    !dest.startsWith(path.resolve(root) + path.sep)
  )
    throw Error("Path must stay inside the project");
  return dest;
}
export function textOnly(script) {
  return script
    .replace(/^#+.*$/gm, "")
    .replace(/\*\*|__/g, "")
    .trim();
}
export function validateWords(words, duration = Infinity) {
  if (!Array.isArray(words) || !words.length)
    throw Error("No word timestamps were found");
  let previous = 0;
  for (const w of words) {
    if (
      typeof w.w !== "string" ||
      !w.w.trim() ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.start < previous - 0.02 ||
      w.end <= w.start ||
      w.end > duration + 0.5
    )
      throw Error(
        "Word timestamps must be positive, ordered, and within the audio",
      );
    previous = w.end;
  }
  return words;
}
export function storyboardFromWords(words) {
  validateWords(words);
  let shots = [],
    group = [];
  for (const w of words) {
    group.push(w);
    if (
      (w.end - group[0].start >= 4 && /[.!?]$/.test(w.w)) ||
      w.end - group[0].start >= 8
    ) {
      shots.push(group);
      group = [];
    }
  }
  if (group.length) shots.push(group);
  return shots.map((a, i) => ({
    id: `s${String(i + 1).padStart(3, "0")}`,
    title: a
      .map((w) => w.w)
      .join(" ")
      .slice(0, 75),
    start: i === 0 ? 0 : a[0].start,
    end: i < shots.length - 1 ? shots[i + 1][0].start : a.at(-1).end,
    narration: a.map((w) => w.w).join(" "),
    scene: null,
    status: "pending",
  }));
}
const element = z.object({
  id: z.string().min(1).max(128),
  type: z.enum([
    "rect",
    "circle",
    "text",
    "line",
    "path",
    "image",
    "video",
    "model",
    "box",
    "sphere",
    "cylinder",
    "cone",
  ]),
  x: z.number().default(0),
  y: z.number().default(0),
  z: z.number().default(0),
  width: z.number().min(0).max(4000).default(100),
  height: z.number().min(0).max(4000).default(100),
  depth: z.number().default(1),
  radius: z.number().min(0).default(50),
  fill: z.string().default("#b8d7c8"),
  stroke: z.string().default(""),
  strokeWidth: z.number().default(2),
  text: z.string().max(300).default(""),
  fontSize: z.number().min(8).max(180).default(40),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  path: z.string().default(""),
  src: z.string().default(""),
  scale: z.number().positive().max(1000).default(1),
  offset: z.number().min(0).default(0),
  loop: z.boolean().default(true),
  animation: z
    .enum(["none", "fade", "slide", "float", "pulse", "rotate", "draw"])
    .default("none"),
  delay: z.number().min(0).default(0),
  duration: z.number().min(0.05).default(1),
});
export const sceneSchema = z.object({
  background: z.string().default("#172b32"),
  label: z.string().default(""),
  camera: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  elements: z.array(element).min(1).max(120),
});
export function validateScene(scene) {
  const result = sceneSchema.parse(scene);
  if (new Set(result.elements.map((e) => e.id)).size !== result.elements.length)
    throw Error("Scene element IDs must be unique");
  for (const e of result.elements) {
    if (
      ["image", "video", "model"].includes(e.type) &&
      !/^assets\/[\w./-]+$/.test(e.src)
    )
      throw Error("Media must reference a project asset");
    if (e.src.includes("..")) throw Error("Invalid asset path");
    if (e.type === "text" && e.text.length > 150 && e.fontSize > 64)
      throw Error("Text is too long for a large title");
  }
  return result;
}
export function topo(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw Error("Duplicate node ids");
  for (const e of edges)
    if (!ids.has(e.source) || !ids.has(e.target))
      throw Error("Connection references a missing node");
  const out = [],
    pending = [...nodes];
  while (pending.length) {
    const i = pending.findIndex((n) =>
      edges
        .filter((e) => e.target === n.id)
        .every((e) => out.some((p) => p.id === e.source)),
    );
    if (i < 0) throw Error("Routine contains a cycle");
    out.push(pending.splice(i, 1)[0]);
  }
  return out;
}
export function allowedLicense(license) {
  return /^(CC0|CC-BY(-SA)?(-[\d.]+)?|public domain|user-owned)$/i.test(
    license,
  );
}
export function run(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    options.onChild?.(child);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      options.onData?.(String(d));
    });
    child.stderr.on("data", (d) => {
      stderr += d;
      options.onErrorData?.(String(d));
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error(`${path.basename(exe)} timed out`));
    }, options.timeout || 120000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = Error(
          (stderr || stdout || `${exe} exited ${code}`).slice(-6000),
        );
        error.stdout = stdout;
        error.stderr = stderr;
        error.exitCode = code;
        reject(error);
      }
    });
    if (options.input) child.stdin.write(options.input);
    child.stdin.end();
  });
}

export class Store {
  async init(root) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
    const SQL = await initSqlJs();
    this.file = path.join(root, "app.db");
    this.db = new SQL.Database(
      fs.existsSync(this.file) ? fs.readFileSync(this.file) : undefined,
    );
    this.db.run(
      "CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT, PRIMARY KEY(kind,id))",
    );
    this.save();
    return this;
  }
  save() {
    atomic(this.file, Buffer.from(this.db.export()));
  }
  all(kind) {
    const q = this.db.prepare("SELECT data FROM records WHERE kind = ?");
    q.bind([kind]);
    let rows = [];
    while (q.step()) rows.push(JSON.parse(q.getAsObject().data));
    q.free();
    return rows;
  }
  get(kind, id) {
    return this.all(kind).find((x) => x.id === id);
  }
  put(kind, data) {
    this.db.run("INSERT OR REPLACE INTO records VALUES (?,?,?)", [
      kind,
      data.id,
      JSON.stringify(data),
    ]);
    this.save();
    return data;
  }
  remove(kind, id) {
    this.db.run("DELETE FROM records WHERE kind=? AND id=?", [kind, id]);
    this.save();
  }
  settings() {
    return {
      provider: "codex",
      model: "",
      effort: "medium",
      localUrl: "http://127.0.0.1:11434/v1",
      localModel: "",
      ttsProvider: "windows",
      voice: "",
      whisperModel: "base",
      python: "py",
      concurrency: 1,
      fps: 30,
      ...this.get("settings", "app"),
    };
  }
  projectDir(id) {
    if (!/^[\w-]+$/.test(id)) throw Error("Invalid project id");
    return safePath(path.join(this.root, "projects"), id);
  }
  project(id) {
    const p = this.get("projects", id);
    if (!p) throw Error("Project not found");
    return p;
  }
  saveProject(p) {
    const latest = this.get("projects", p.id);
    if (latest && latest.updatedAt > p.updatedAt) p.notes = latest.notes;
    p.updatedAt = new Date().toISOString();
    this.put("projects", p);
    atomic(path.join(this.projectDir(p.id), "project.json"), p);
    return p;
  }
  async create(input) {
    if (!input.title?.trim()) throw Error("Give your video a title");
    const p = {
      id: uid(),
      title: input.title.trim().slice(0, 180),
      topic: input.topic || "",
      direction: input.direction || "",
      style: input.style || "flat",
      look: input.look || "Bold & bright",
      format: input.format || "16:9",
      language: input.language || "en",
      targetLengthSec: Number(input.targetLengthSec) || 60,
      channelId: input.channelId || null,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      script: input.script || "",
      research: "",
      shots: [],
      words: [],
      notes: [],
      pipeline: Object.fromEntries(
        stages.map((s) => [
          s,
          s === "script" && input.script ? "done" : "pending",
        ]),
      ),
    };
    const dir = this.projectDir(p.id);
    for (const sub of ["audio", "scenes", "assets", "exports", "sound"])
      fs.mkdirSync(path.join(dir, sub), { recursive: true });
    atomic(path.join(dir, "script.txt"), p.script);
    atomic(path.join(dir, "assets", "ATTRIBUTIONS.json"), []);
    atomic(
      path.join(dir, ".gitignore"),
      "audio/\nexports/\nassets/\n.frames/\n",
    );
    this.saveProject(p);
    await run("git", ["init"], { cwd: dir });
    await run("git", ["config", "user.name", "Framecraft Studio"], {
      cwd: dir,
    });
    await run("git", ["config", "user.email", "local@framecraft.studio"], {
      cwd: dir,
    });
    await this.commit(p.id, "Create project");
    return p;
  }
  async commit(id, message) {
    const cwd = this.projectDir(id);
    await run(
      "git",
      [
        "add",
        "--",
        "project.json",
        "script.txt",
        "research.md",
        "storyboard.json",
        "scenes",
        "AGENT_GUIDE.md",
      ].filter((x, i) => i < 2 || fs.existsSync(path.join(cwd, x))),
      { cwd },
    );
    await run("git", ["commit", "--allow-empty", "-m", message.slice(0, 200)], {
      cwd,
    });
    return (await run("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  }
}

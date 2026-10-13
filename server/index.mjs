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
  topo,
  allowedLicense,
} from "./core.mjs";
import { AgentRunner, Vault } from "./agents.mjs";
import { Pipeline } from "./pipeline.mjs";
import { integrations } from "./integrations.mjs";
import { assetRoutes } from "./assets.mjs";
import { AgentTools } from "./agent-tools.mjs";
import { watchScenes } from "./scene-watch.mjs";
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function startServer(options = {}) {
  const root =
    options.root ||
    process.env.FRAMECRAFT_WORKSPACE ||
    path.join(appRoot, ".workspace");
  const store = await new Store().init(root),
    vault = new Vault(root);
  if (options.safeStorage) vault.safeStorage = options.safeStorage;
  const agents = new AgentRunner(store, vault),
    pipeline = new Pipeline(store, agents, vault);
  const agentTools = new AgentTools(store, pipeline);
  agents.toolBridge = agentTools;
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
      projects: store
        .all("projects")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      jobs: store
        .all("jobs")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      channels: store.all("channels"),
      memory: store.all("memory"),
      styles: [...styles, ...store.all("styles")],
      routines: store.all("routines"),
      thumbnails: store.all("thumbnails"),
      boards: store.all("boards"),
      uploads: store.all("uploads").map(({ location, ...record }) => record),
      learnings: store.all("learnings"),
      settings: {
        ...store.settings(),
        calibrations: store.all("calibrations"),
        vault: {
          apiKey: vault.has("apiKey"),
          elevenlabs: vault.has("elevenlabs"),
          google: vault.has("googleTokens"),
        },
      },
      workspace: root,
    }),
  );
  route("get", "/api/projects/:id", async (req, res) =>
    res.json(store.project(req.params.id)),
  );
  route("post", "/api/projects", async (req, res) =>
    res.status(201).json(await store.create(req.body)),
  );
  route("patch", "/api/projects/:id", async (req, res) => {
    const p = store.project(req.params.id);
    if (
      [...pipeline.active.values()].some((j) => j.projectId === p.id) &&
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
      const p = await store.create(data),
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
      };
      imported.shots = (imported.shots || []).map((s) => ({
        ...s,
        scene: s.scene ? validateScene(s.scene) : null,
      }));
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
        "time",
        "storyboard",
        "build",
        "edit",
        "ultra",
        "qa",
        "mix",
        "export",
        "thumbnail",
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
    delete data.elevenlabs;
    store.put("settings", data);
    res.json(data);
  });
  route("post", "/api/credentials", async (req, res) => {
    if (
      ![
        "apiKey",
        "elevenlabs",
        "fish",
        "imageKey",
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
      if (kind === "routines") topo(value.nodes || [], value.edges || []);
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
  if (fs.existsSync(path.join(appRoot, "dist", "index.html"))) {
    app.use(express.static(path.join(appRoot, "dist")));
    app.get("/{*splat}", (req, res) =>
      res.sendFile(path.join(appRoot, "dist", "index.html")),
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
    const now = new Date();
    for (const r of store.all("routines")) {
      if (!r.schedule?.enabled || !r.schedule.time) continue;
      const today = now.toLocaleDateString("en-CA"),
        time = now.toTimeString().slice(0, 5);
      if (time === r.schedule.time && r.lastScheduledDay !== today) {
        r.lastScheduledDay = today;
        store.put("routines", r);
        pipeline.enqueue(r.projectId || null, "routine", { routineId: r.id });
      }
    }
  }, 15000);
  timer.unref();
  return {
    server,
    store,
    pipeline,
    vault,
    agentTools,
    sceneWatcher,
    url: base,
    close: async () => {
      clearInterval(timer);
      sceneWatcher.close();
      integrationsRuntime.close();
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
  console.log(`Framecraft Studio: ${service.url}`);
}

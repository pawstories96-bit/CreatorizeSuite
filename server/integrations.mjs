import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { uid, atomic, read, safePath } from "./core.mjs";
import { transferUpload, cancelUploads } from "./youtube-upload.mjs";
import { audienceRoutes } from "./audience.mjs";
import { comfyModels, generateComfy } from "./comfy.mjs";
export function integrations(app, { store, vault, getBase, pipeline }) {
  const route = (method, url, fn) =>
    app[method](url, async (req, res, next) => {
      try {
        await fn(req, res);
      } catch (e) {
        next(e);
      }
    });
  const pending = new Map();
  async function token() {
    const raw = await vault.get("googleTokens");
    if (!raw) throw Error("Connect your YouTube account first");
    const t = JSON.parse(raw);
    if (t.expires_at > Date.now() + 60000) return t.access_token;
    const client_id = await vault.get("googleClientId"),
      client_secret = await vault.get("googleClientSecret");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        refresh_token: t.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const j = await r.json();
    if (!r.ok)
      throw Error(
        j.error_description ||
          "Google token refresh failed. Reconnect YouTube.",
      );
    await vault.set(
      "googleTokens",
      JSON.stringify({
        ...t,
        ...j,
        expires_at: Date.now() + j.expires_in * 1000,
      }),
    );
    return j.access_token;
  }
  async function google(url, options = {}) {
    const r = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${await token()}`, ...options.headers },
    });
    if (!r.ok)
      throw Error(`YouTube ${r.status}: ${(await r.text()).slice(0, 1000)}`);
    return r;
  }
  route("post", "/api/youtube/connect", async (req, res) => {
    const client = await vault.get("googleClientId");
    if (!client)
      throw Error(
        "Save your Google Desktop OAuth client ID and client secret in Connections first",
      );
    const state = uid(),
      verifier = crypto.randomBytes(32).toString("base64url");
    pending.set(state, { verifier, created: Date.now() });
    const query = new URLSearchParams({
      client_id: client,
      redirect_uri: getBase() + "/oauth/google",
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    });
    res.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + query });
  });
  route("get", "/oauth/google", async (req, res) => {
    const auth = pending.get(req.query.state);
    pending.delete(req.query.state);
    if (!auth || Date.now() - auth.created > 600000)
      throw Error("This sign-in request expired. Start again from the app.");
    if (req.query.error) throw Error("Google sign-in was not completed");
    const client_id = await vault.get("googleClientId"),
      client_secret = await vault.get("googleClientSecret");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code: String(req.query.code),
        code_verifier: auth.verifier,
        redirect_uri: getBase() + "/oauth/google",
        grant_type: "authorization_code",
      }),
    });
    const tokens = await r.json();
    if (!r.ok) throw Error(tokens.error_description || "Google sign-in failed");
    await vault.set(
      "googleTokens",
      JSON.stringify({
        ...tokens,
        expires_at: Date.now() + tokens.expires_in * 1000,
      }),
    );
    const data = await (
      await google(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      )
    ).json();
    for (const c of data.items || []) {
      const existing = store.all("channels").find((x) => x.youtubeId === c.id);
      store.put("channels", {
        id: existing?.id || uid(),
        name: c.snippet.title,
        youtubeId: c.id,
        description: c.snippet.description,
        statistics: c.statistics,
        updatedAt: new Date().toISOString(),
      });
    }
    res
      .type("html")
      .send(
        '<html><body style="background:#17231b;color:#d2e4d7;font:18px system-ui;padding:60px"><h1>YouTube connected</h1><p>You can return to Framecraft Studio and close this tab.</p></body></html>',
      );
  });
  route("get", "/api/youtube/analytics", async (req, res) => {
    const end = new Date().toISOString().slice(0, 10),
      start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    const metrics =
      "views,estimatedMinutesWatched,subscribersGained,averageViewDuration";
    const q = new URLSearchParams({
      ids: "channel==MINE",
      startDate: start,
      endDate: end,
      metrics,
      dimensions: "day",
      sort: "day",
    });
    const j = await (
      await google("https://youtubeanalytics.googleapis.com/v2/reports?" + q)
    ).json();
    const totals = {};
    metrics
      .split(",")
      .forEach(
        (m, i) =>
          (totals[m] = (j.rows || []).reduce(
            (n, r) => n + Number(r[i + 1]),
            0,
          )),
      );
    const totalQuery = new URLSearchParams({
      ids: "channel==MINE",
      startDate: start,
      endDate: end,
      metrics,
    });
    const aggregate = await (
      await google(
        "https://youtubeanalytics.googleapis.com/v2/reports?" + totalQuery,
      )
    ).json();
    metrics
      .split(",")
      .forEach((m, i) => (totals[m] = Number(aggregate.rows?.[0]?.[i] || 0)));
    res.json({ rows: j.rows || [], totals });
  });
  route("post", "/api/youtube/upload", async (req, res) => {
    res.json(await uploadVideo(req.body));
  });
  pipeline.uploadVideo = async (body) => {
    const p = store.project(body.projectId);
    const record = store
      .all("uploads")
      .find((r) => r.projectId === p.id && r.path === p.lastExport);
    if (record?.status === "done")
      return {
        id: record.videoId,
        url: `https://www.youtube.com/watch?v=${record.videoId}`,
      };
    if (record) {
      const result = await transferUpload(store, token, record, true);
      await finishUpload(p, record, result);
      return {
        id: result.id,
        url: `https://www.youtube.com/watch?v=${result.id}`,
      };
    }
    return uploadVideo(body);
  };
  async function uploadVideo(body) {
    const req = { body };
    const p = store.project(req.body.projectId);
    if (!p.lastExport) throw Error("Export the video before uploading");
    if (
      store
        .all("uploads")
        .some(
          (r) =>
            r.projectId === p.id &&
            r.path === p.lastExport &&
            ["uploading", "error"].includes(r.status),
        )
    )
      throw Error(
        "An unfinished upload exists. Use Resume upload in the YouTube page.",
      );
    const file = safePath(store.projectDir(p.id), p.lastExport),
      size = fs.statSync(file).size;
    const privacy = ["private", "unlisted", "public"].includes(req.body.privacy)
      ? req.body.privacy
      : "private";
    const ledger = read(
      path.join(store.projectDir(p.id), "assets", "ATTRIBUTIONS.json"),
      [],
    );
    const attribution = ledger
      .filter((a) => a.source !== "Local import")
      .map((a) => `${a.name} — ${a.author} (${a.license}) ${a.source}`)
      .join("\n");
    const metadata = {
      snippet: {
        title: String(req.body.title || p.title).slice(0, 100),
        description: (
          String(req.body.description || "") +
          (attribution ? "\n\nCredits\n" + attribution : "")
        ).slice(0, 5000),
        tags: p.metadata?.tags || [],
        categoryId: "27",
        defaultLanguage: p.language,
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: !!req.body.kids,
        containsSyntheticMedia: !!req.body.synthetic,
      },
    };
    if (req.body.publishAt) {
      const date = new Date(req.body.publishAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
        throw Error("Choose a future publishing time");
      metadata.status.privacyStatus = "private";
      metadata.status.publishAt = date.toISOString();
    }
    const start = await google(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Upload-Content-Length": String(size),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      },
    );
    const location = start.headers.get("location");
    if (!location) throw Error("YouTube did not return an upload session");
    const record = {
      id: uid(),
      projectId: p.id,
      status: "uploading",
      location,
      offset: 0,
      size,
      path: p.lastExport,
      mtimeMs: fs.statSync(file).mtimeMs,
      title: metadata.snippet.title,
      publishAt: metadata.status.publishAt,
      createdAt: new Date().toISOString(),
    };
    store.put("uploads", record);
    const result = await transferUpload(store, token, record);
    await finishUpload(p, record, result);
    return {
      id: result.id,
      url: `https://www.youtube.com/watch?v=${result.id}`,
      warning: record.thumbnailError,
    };
  }
  async function finishUpload(p, record, result) {
    p.youtubeVideoId = result.id;
    p.status = "published";
    p.publishAt = record.publishAt;
    store.saveProject(p);
    record.status = "done";
    record.videoId = result.id;
    store.put("uploads", record);
    if (p.thumbnail) {
      try {
        const thumbnail = safePath(store.projectDir(p.id), p.thumbnail);
        await google(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(result.id)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": p.thumbnail.endsWith(".png")
                ? "image/png"
                : "image/jpeg",
            },
            body: fs.readFileSync(thumbnail),
          },
        );
      } catch (e) {
        record.thumbnailError = e.message;
        store.put("uploads", record);
      }
    }
  }
  route("post", "/api/youtube/uploads/:id/resume", async (req, res) => {
    const record = store.get("uploads", req.params.id);
    if (!record) throw Error("Upload not found");
    const result = await transferUpload(store, token, record, true);
    await finishUpload(store.project(record.projectId), record, result);
    res.json({
      id: result.id,
      url: `https://www.youtube.com/watch?v=${result.id}`,
      warning: record.thumbnailError,
    });
  });
  route("post", "/api/thumbnails/:id/assign", async (req, res) => {
    const t = store.get("thumbnails", req.params.id);
    if (!t) throw Error("Thumbnail not found");
    const p = store.project(t.projectId);
    p.thumbnail = t.path;
    store.saveProject(p);
    res.json(p);
  });
  route("post", "/api/thumbnails/generate", async (req, res) => {
    const p = store.project(req.body.projectId),
      s = store.settings(),
      key = (await vault.get("imageKey")) || (await vault.get("apiKey"));
    if (s.imageProvider === "comfy") {
      const refs = (req.body.references || []).map((ref) => {
        const file = safePath(store.projectDir(ref.projectId), ref.path);
        if (!/\.(png|jpe?g|webp)$/i.test(file))
          throw Error("Use image references");
        return { bytes: fs.readFileSync(file), mime: /\.webp$/i.test(file) ? "image/webp" : /\.jpe?g$/i.test(file) ? "image/jpeg" : "image/png" };
      });
      const channel = store.get("channels", p.channelId);
      const result = await generateComfy({
        settings: s,
        prompt: [req.body.prompt, channel?.thumbnailStyleKey]
          .filter(Boolean)
          .join("\n"),
        references: refs,
      });
      const rel = `assets/thumbnail-${uid()}.png`;
      atomic(path.join(store.projectDir(p.id), rel), result.bytes);
      const record = store.put("thumbnails", {
        id: uid(),
        name: p.title,
        projectId: p.id,
        path: rel,
        prompt: req.body.prompt,
        provider: "comfy",
        model: result.model,
        seed: result.seed,
        promptId: result.promptId,
        parentId: req.body.parentId || null,
        createdAt: new Date().toISOString(),
      });
      res.json(record);
      return;
    }
    if (!key) throw Error("Add an image provider key in Connections");
    if (!s.imageModel || !s.imageUrl)
      throw Error("Set your image generation model and endpoint in Settings");
    const references = req.body.references || [];
    const channel = store.get("channels", p.channelId);
    const prompt = [String(req.body.prompt || ""), channel?.thumbnailStyleKey]
      .filter(Boolean)
      .join("\n");
    if (!Array.isArray(references) || references.length > 8)
      throw Error("Use up to eight image references");
    let body,
      endpoint = s.imageUrl,
      headers = { Authorization: `Bearer ${key}` };
    if (references.length) {
      if (!s.imageEditUrl)
        throw Error(
          "Set the image edit endpoint in Settings to generate with reference images",
        );
      endpoint = s.imageEditUrl;
      body = new FormData();
      body.append("model", s.imageModel);
      body.append("prompt", prompt);
      body.append("size", "1536x1024");
      for (const ref of references) {
        store.project(ref.projectId);
        const file = safePath(store.projectDir(ref.projectId), ref.path);
        const ext = path.extname(file).toLowerCase();
        const mime = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        }[ext];
        if (!mime || !fs.existsSync(file))
          throw Error("Reference must be an existing PNG, JPEG or WebP image");
        body.append(
          "image[]",
          new Blob([fs.readFileSync(file)], { type: mime }),
          path.basename(file),
        );
      }
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        model: s.imageModel,
        prompt,
        n: 1,
        size: "1536x1024",
      });
    }
    const r = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(600000),
    });
    if (!r.ok)
      throw Error(
        `Image provider ${r.status}: ${(await r.text()).slice(0, 500)}`,
      );
    const j = await r.json();
    let buffer;
    if (j.data?.[0]?.b64_json)
      buffer = Buffer.from(j.data[0].b64_json, "base64");
    else if (j.data?.[0]?.url) {
      const url = new URL(j.data[0].url);
      if (url.protocol !== "https:")
        throw Error("Provider image URL must use HTTPS");
      const image = await fetch(url);
      if (!image.ok) throw Error("Could not retrieve generated image");
      buffer = Buffer.from(await image.arrayBuffer());
    } else throw Error("Image endpoint did not return an image");
    const rel = `assets/thumbnail-${uid()}.png`;
    atomic(path.join(store.projectDir(p.id), rel), buffer);
    const t = store.put("thumbnails", {
      id: uid(),
      name: p.title,
      projectId: p.id,
      path: rel,
      prompt: req.body.prompt,
      provider: "api",
      model: s.imageModel,
      parentId: req.body.parentId || null,
      styleKey: channel?.thumbnailStyleKey || "",
      createdAt: new Date().toISOString(),
    });
    res.json(t);
  });
  route("get", "/api/comfy/models", async (req, res) =>
    res.json(
      await comfyModels(store.settings().comfyUrl || "http://127.0.0.1:8188"),
    ),
  );
  audienceRoutes(app, { store, google, pipeline });
  return { close: () => cancelUploads(store.root) };
}

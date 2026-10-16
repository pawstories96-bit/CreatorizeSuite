import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run } from "./core.mjs";
export function channelURL(value) {
  const url = new URL(String(value));
  if (
    url.protocol !== "https:" ||
    !["youtube.com", "www.youtube.com"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw Error("Use a public YouTube channel URL");
  const parts = url.pathname.split("/").filter(Boolean);
  const root = parts[0]?.startsWith("@")
    ? parts[0]
    : ["channel", "c", "user"].includes(parts[0]) && parts[1]
      ? `${parts[0]}/${parts[1]}`
      : null;
  if (!root || !/^[@\w./%-]+$/.test(root))
    throw Error("Choose a channel handle or channel URL");
  return "https://www.youtube.com/" + root;
}
export function catalogKey(url) {
  return crypto
    .createHash("sha256")
    .update(channelURL(url).toLowerCase())
    .digest("hex")
    .slice(0, 24);
}
export async function publicChannelCatalog(store, input, job, emit) {
  const channel = channelURL(input.url),
    id = catalogKey(channel),
    existing = store.get("catalogs", id),
    limit = Number(input.limit ?? 5000);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
    throw Error("Choose a catalog limit from 1 to 5,000 videos");
  if (
    !input.refresh &&
    existing &&
    existing.limit >= limit &&
    Date.now() - Date.parse(existing.fetchedAt) < 86400000 &&
    (!input.dates || existing.datesComplete)
  )
    return existing;
  let python =
    store.settings().catalogPython || store.settings().python || "py";
  try {
    await run(python, ["-m", "yt_dlp", "--version"], {
      timeout: 30000,
      onChild: (c) => (job.abort = () => c.kill()),
    });
  } catch (e) {
    if (!/No module named yt_dlp/.test(e.message))
      throw Error(
        "The channel reader needs a working Python installation. Check Python in Settings. " +
          e.message.slice(0, 200),
      );
    emit(
      "info",
      "Installing the public channel reader into your workspace’s local Python environment",
    );
    const envDir = path.join(store.root, "tools", "python"),
      local = path.join(
        envDir,
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
    if (!fs.existsSync(local))
      await run(python, ["-m", "venv", envDir], {
        timeout: 180000,
        onChild: (c) => (job.abort = () => c.kill()),
      });
    if (job.cancelled) throw Error("Stopped by user");
    await run(local, ["-m", "pip", "install", "yt-dlp"], {
      timeout: 600000,
      onChild: (c) => (job.abort = () => c.kill()),
    });
    python = local;
    store.put("settings", {
      ...store.settings(),
      id: "app",
      catalogPython: local,
    });
  }
  const invoke = async (args) => {
    if (job.cancelled) throw Error("Stopped by user");
    try {
      return await run(python, ["-m", "yt_dlp", ...args], {
        timeout: 600000,
        onChild: (c) => (job.abort = () => c.kill()),
      });
    } catch (e) {
      if (/No module named yt_dlp/.test(e.message))
        throw Error(
          "The public channel reader needs yt-dlp. Install it for your configured Python with: python -m pip install yt-dlp",
        );
      throw e;
    }
  };
  emit(
    "info",
    "Reading the public channel Videos tab; Shorts are excluded by the tab selection.",
  );
  const raw = await invoke([
    "--flat-playlist",
    "--skip-download",
    "--dump-single-json",
    "--no-warnings",
    "--playlist-end",
    String(limit),
    channel + "/videos",
  ]);
  const data = JSON.parse(raw.stdout);
  const previous = new Map((existing?.videos || []).map((v) => [v.id, v]));
  const videos = (data.entries || [])
    .filter(
      (v) =>
        /^[\w-]{11}$/.test(v.id) && !String(v.url || "").includes("/shorts/"),
    )
    .map((v) => {
      const old = previous.get(v.id),
        timestamp = v.timestamp || v.release_timestamp;
      return {
        id: v.id,
        title: String(v.title || ""),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        duration: Number.isFinite(v.duration)
          ? v.duration
          : (old?.duration ?? null),
        views: Number.isFinite(v.view_count)
          ? v.view_count
          : (old?.views ?? null),
        thumbnail:
          v.thumbnails?.at(-1)?.url ||
          v.thumbnail ||
          old?.thumbnail ||
          `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        uploadedAt: timestamp
          ? new Date(timestamp * 1000).toISOString()
          : old?.uploadedAt || null,
      };
    });
  if (!videos.length)
    throw Error(
      "No public Videos-tab entries were returned. Check the URL and channel availability.",
    );
  const record = {
    id,
    url: channel,
    title: data.channel || data.uploader || data.title || channel,
    videos,
    limit,
    fetchedAt: new Date().toISOString(),
    datesComplete: videos.every((v) => v.uploadedAt),
    source: "YouTube public Videos tab via yt-dlp",
    warnings: [],
  };
  store.put("catalogs", record);
  if (input.dates)
    for (const [index, video] of videos.entries()) {
      if (video.uploadedAt) continue;
      emit(
        "info",
        `Reading upload metadata ${index + 1}/${videos.length}: ${video.title}`,
      );
      try {
        const response = await invoke([
          "--skip-download",
          "--dump-single-json",
          "--no-warnings",
          "--no-playlist",
          "--extractor-args",
          "youtube:player_client=android",
          video.url,
        ]);
        const item = JSON.parse(response.stdout),
          timestamp = item.timestamp || item.release_timestamp;
        video.uploadedAt = timestamp
          ? new Date(timestamp * 1000).toISOString()
          : item.upload_date && /^\d{8}$/.test(item.upload_date)
            ? `${item.upload_date.slice(0, 4)}-${item.upload_date.slice(4, 6)}-${item.upload_date.slice(6)}T00:00:00.000Z`
            : null;
        if (Number.isFinite(item.view_count)) video.views = item.view_count;
        if (Number.isFinite(item.duration)) video.duration = item.duration;
        delete video.metadataError;
      } catch (e) {
        if (job.cancelled) throw e;
        video.metadataError = e.message.slice(0, 300);
      }
      store.put("catalogs", record);
    }
  record.datesComplete = videos.every((v) => v.uploadedAt);
  if (!record.datesComplete)
    record.warnings.push(
      "Some upload dates are unavailable. Fetch full metadata to attempt missing dates; restricted or throttled videos remain labeled unavailable.",
    );
  record.fetchedAt = new Date().toISOString();
  store.put("catalogs", record);
  return record;
}
export function duplicateTopic(topic, titles) {
  const tokens = (value) =>
    new Set(
      String(value)
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 2 &&
            ![
              "the",
              "and",
              "with",
              "for",
              "how",
              "why",
              "what",
              "this",
              "that",
            ].includes(w),
        ),
    );
  const a = tokens(topic);
  return titles.some((title) => {
    const b = tokens(title),
      shared = [...a].filter((w) => b.has(w)).length;
    return (
      String(title).trim().toLowerCase() ===
        String(topic).trim().toLowerCase() ||
      (a.size >= 3 && b.size >= 3 && shared / Math.min(a.size, b.size) >= 0.8)
    );
  });
}

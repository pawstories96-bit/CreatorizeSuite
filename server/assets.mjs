import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomic, read, allowedLicense, uid, run } from "./core.mjs";
import { publicDownload } from "./research.mjs";
const strip = (s) =>
  String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .trim();
export function normalizeLicense(value) {
  const s = strip(value).toUpperCase();
  if (/\bNC\b|\bND\b|NONCOMMERCIAL|NO.DERIVATIVES/.test(s)) return null;
  if (/PUBLIC DOMAIN/.test(s)) return "public domain";
  if (/CC0/.test(s)) return "CC0";
  const match = s.match(/CC[ -]BY(?:[ -]SA)?[ -]?[\d.]*/);
  if (!match) return null;
  const license = match[0].replace(/\s+/g, "-");
  return allowedLicense(license) ? license : null;
}
export function assetRoutes(app, store) {
  const route = (method, url, fn) =>
    app[method](url, async (req, res, next) => {
      try {
        await fn(req, res);
      } catch (e) {
        next(e);
      }
    });
  route("get", "/api/asset-search", async (req, res) => {
    const q = String(req.query.q || "").slice(0, 150);
    if (q.length < 2) throw Error("Enter a search term");
    const query = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: q,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "480",
    });
    const response = await fetch(
      "https://commons.wikimedia.org/w/api.php?" + query,
      {
        headers: {
          "User-Agent": "FramecraftStudio/0.1 (local video authoring)",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw Error(`Wikimedia Commons returned ${response.status}`);
    const data = await response.json();
    if (data.error)
      throw Error(`Wikimedia search: ${data.error.info || data.error.code}`);
    const results = [];
    for (const item of Object.values(data.query?.pages || {})) {
      const info = item.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {},
        license = normalizeLicense(meta.LicenseShortName?.value);
      const sourceUrl = new URL(info.url);
      sourceUrl.search = "";
      sourceUrl.hash = "";
      if (
        !license ||
        !/^https:\/\/upload\.wikimedia\.org\/.+\.(png|jpe?g|webp|webm|ogv|mp4)$/i.test(
          sourceUrl.href,
        )
      )
        continue;
      results.push({
        id: item.pageid,
        name: item.title.replace(/^File:/, ""),
        url: sourceUrl.href,
        preview: info.thumburl || info.url,
        source: info.descriptionurl,
        license,
        author: strip(meta.Artist?.value),
        description: strip(meta.ImageDescription?.value).slice(0, 300),
      });
    }
    res.json(results);
  });
  route("post", "/api/projects/:id/assets/download", async (req, res) => {
    const p = store.project(req.params.id),
      item = req.body;
    if (!allowedLicense(item.license))
      throw Error("This asset needs a permitted license");
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.hostname !== "upload.wikimedia.org")
      throw Error("Only Wikimedia Commons downloads are supported here");
    const { bytes } = await publicDownload(url.href, 150 * 1024 * 1024);
    const ext = path.extname(url.pathname).toLowerCase();
    if (
      ![".jpg", ".jpeg", ".png", ".webp", ".webm", ".ogv", ".mp4"].includes(ext)
    )
      throw Error("Choose an image or video asset");
    const video = [".webm", ".ogv", ".mp4"].includes(ext),
      hash = crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 24);
    const rel = `assets/${hash}${video ? ".mp4" : ext}`,
      destination = path.join(store.projectDir(p.id), rel);
    if (video) {
      const source = path.join(
        store.projectDir(p.id),
        "assets",
        hash + "-source" + ext,
      );
      atomic(source, bytes);
      try {
        await run(
          "ffmpeg",
          [
            "-y",
            "-i",
            source,
            "-map",
            "0:v:0",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            destination,
          ],
          { timeout: 180000 },
        );
      } finally {
        fs.rmSync(source, { force: true });
      }
    } else atomic(destination, bytes);
    const ledgerPath = path.join(
        store.projectDir(p.id),
        "assets",
        "ATTRIBUTIONS.json",
      ),
      ledger = read(ledgerPath, []);
    if (!ledger.some((a) => a.path === rel))
      ledger.push({
        path: rel,
        name: item.name,
        source: item.source,
        author: item.author,
        license: item.license,
        retrievedAt: new Date().toISOString(),
      });
    atomic(ledgerPath, ledger);
    res.json({ path: rel });
  });
}

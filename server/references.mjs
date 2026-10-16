import fs from "node:fs";
import path from "node:path";
import { run, safePath, uid } from "./core.mjs";

export async function inspectReference(store, p, input) {
  const file = safePath(store.projectDir(p.id), String(input.path || ""));
  if (
    !String(input.path).startsWith("assets/") ||
    !/\.(mp4|png|jpe?g|webp)$/i.test(file)
  )
    throw Error("Choose an imported MP4, PNG, JPEG or WebP reference");
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  const info = JSON.parse(result.stdout),
    stream = info.streams.find((s) => s.codec_type === "video");
  if (!stream) throw Error("Reference has no visible frames");
  const video = /\.mp4$/i.test(file),
    rate = (stream.avg_frame_rate || stream.r_frame_rate || "30/1")
      .split("/")
      .map(Number),
    fps = rate[0] / (rate[1] || 1);
  const duration = video ? Number(info.format.duration || stream.duration) : 0;
  if (video && (!(duration > 0) || !Number.isFinite(fps) || fps <= 0))
    throw Error("Could not read the reference frame rate and duration");
  const start = video ? Number(input.start ?? 0) : 0,
    end = video ? Number(input.end ?? duration) : 0;
  if (
    video &&
    (!Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > duration + 0.001)
  )
    throw Error("Choose valid reference In/Out points within the video");
  if (!String(input.label || "").trim())
    throw Error("Name the reference technique");
  if (
    video &&
    Math.min(duration, Math.round(end * fps) / fps) <=
      Math.round(start * fps) / fps
  )
    throw Error("Select at least one complete reference frame");
  return {
    id: uid(),
    path: input.path,
    kind: video ? "video" : "image",
    label: String(input.label).trim().slice(0, 160),
    start: video ? Math.round(start * fps) / fps : 0,
    end: video ? Math.min(duration, Math.round(end * fps) / fps) : 0,
    fps: video ? fps : 0,
    duration,
    width: stream.width,
    height: stream.height,
  };
}
export async function referenceFrames(store, p, ref, job) {
  const dir = store.projectDir(p.id),
    source = safePath(dir, ref.path);
  const times =
    ref.kind === "video"
      ? [
          ref.start,
          (ref.start + ref.end) / 2,
          Math.max(ref.start, ref.end - 1 / ref.fps),
        ]
      : [0];
  const files = [];
  for (let i = 0; i < times.length; i++) {
    if (job.cancelled) throw Error("Stopped by user");
    const relative = `assets/reference-${ref.id}-${i}.png`,
      output = path.join(dir, relative);
    await run(
      "ffmpeg",
      [
        "-y",
        ...(ref.kind === "video" ? ["-ss", String(times[i])] : []),
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:1280:force_original_aspect_ratio=decrease",
        output,
      ],
      { timeout: 120000, onChild: (child) => (job.abort = () => child.kill()) },
    );
    if (!fs.statSync(output).size) throw Error("Reference frame was empty");
    files.push({ path: relative, time: times[i] });
  }
  return files;
}
export const referenceGuide = (p) =>
  (p.references || [])
    .filter((r) => r.analysis)
    .map(
      (r) =>
        `Technique reference: ${r.label} (${r.kind}${r.kind === "video" ? ` ${r.start.toFixed(3)}–${r.end.toFixed(3)}s` : ""}). ${JSON.stringify(r.analysis)}. Use the general technique for the current story; do not reproduce source footage, identities or branding.`,
    )
    .join("\n");

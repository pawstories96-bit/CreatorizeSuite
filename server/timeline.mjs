import fs from "node:fs";
import path from "node:path";
import { safePath, run, atomic } from "./core.mjs";
const number = (v, min, max, name) => {
  if (!Number.isFinite(v) || v < min || v > max)
    throw Error(`${name} must be between ${min} and ${max}`);
  return v;
};
export function validateTimeline(value, project, dir) {
  const duration = project.durationSec || project.shots.at(-1)?.end || 0;
  if (!(duration > 0))
    throw Error("Add timed narration or shots before editing the timeline");
  const timeline = { cues: [], cards: [], audio: [] },
    ids = new Set();
  const width = project.format === "9:16" ? 720 : 1280,
    height = project.format === "9:16" ? 1280 : 720;
  for (const track of Object.keys(timeline)) {
    const items = value[track] || [];
    if (!Array.isArray(items) || items.length > 500)
      throw Error("Timeline tracks support up to 500 items");
    for (const raw of items) {
      if (
        !raw ||
        typeof raw.id !== "string" ||
        !/^[\w-]{1,100}$/.test(raw.id) ||
        ids.has(raw.id)
      )
        throw Error("Timeline items need unique IDs");
      ids.add(raw.id);
      if (track === "cues") {
        const shot = project.shots.find((s) => s.id === raw.shotId);
        if (!shot || !shot.scene?.elements.some((e) => e.id === raw.elementId))
          throw Error("A cue must target an existing shot element");
        const time = number(raw.time, shot.start, shot.end - 0.001, "Cue time");
        if (
          timeline.cues.some(
            (c) => c.shotId === shot.id && c.elementId === raw.elementId,
          )
        )
          throw Error("Use one cue per element");
        timeline.cues.push({
          id: raw.id,
          shotId: shot.id,
          elementId: raw.elementId,
          time,
          label: String(raw.label || raw.elementId).slice(0, 120),
        });
        continue;
      }
      const start = number(raw.start, 0, duration, "Start"),
        end = number(raw.end, start + 0.01, duration, "End");
      if (track === "cards") {
        const text = String(raw.text || "").trim();
        if (!text || text.length > 400)
          throw Error("Card text must contain 1–400 characters");
        timeline.cards.push({
          id: raw.id,
          start,
          end,
          text,
          x: number(raw.x ?? width / 2, 0, width, "Card x"),
          y: number(raw.y ?? height * 0.8, 0, height, "Card y"),
          width: number(raw.width ?? width * 0.8, 40, width, "Card width"),
          height: number(raw.height ?? 100, 30, height, "Card height"),
          fontSize: number(raw.fontSize ?? 32, 16, 120, "Font size"),
          fill: /^#[\da-f]{6}$/i.test(raw.fill) ? raw.fill : "#ffffff",
          background: /^#[\da-f]{6}$/i.test(raw.background)
            ? raw.background
            : "#17231b",
        });
      } else {
        if (!["ambience", "music", "sfx"].includes(raw.track))
          throw Error("Choose an audio track");
        if (
          !/^assets\/[\w .-]+\.(wav|mp3|ogg|m4a)$/i.test(raw.src) ||
          !fs.existsSync(safePath(dir, raw.src))
        )
          throw Error("Choose an imported audio file");
        timeline.audio.push({
          id: raw.id,
          track: raw.track,
          src: raw.src,
          start,
          end,
          offset: number(raw.offset ?? 0, 0, 86400, "Source offset"),
          volumeDb: number(raw.volumeDb ?? -20, -60, 6, "Volume"),
          fadeIn: number(raw.fadeIn ?? 0.1, 0, (end - start) / 2, "Fade in"),
          fadeOut: number(raw.fadeOut ?? 0.1, 0, (end - start) / 2, "Fade out"),
          loop: raw.loop !== false,
        });
      }
    }
  }
  return timeline;
}
export async function mixTimeline(project, dir, job) {
  const clips = validateTimeline(project.timeline, project, dir).audio;
  if (!clips.length) throw Error("Add an audio clip to the timeline first");
  const args = ["-y", "-i", safePath(dir, project.audio)],
    filters = [],
    labels = [];
  for (const [i, clip] of clips.entries()) {
    args.push(
      ...(clip.loop ? ["-stream_loop", "-1"] : []),
      "-i",
      safePath(dir, clip.src),
    );
    const len = clip.end - clip.start;
    filters.push(
      `[${i + 1}:a]atrim=start=${clip.offset}:duration=${len},asetpts=PTS-STARTPTS,volume=${clip.volumeDb}dB,afade=t=in:d=${clip.fadeIn},afade=t=out:st=${len - clip.fadeOut}:d=${clip.fadeOut},adelay=${Math.round(clip.start * 1000)}:all=1[c${i}]`,
    );
    labels.push(`[c${i}]`);
  }
  filters.push(
    `${labels.join("")}amix=inputs=${clips.length}:normalize=0,apad,atrim=duration=${project.durationSec}[bed]`,
    "[0:a]asplit[narr][sc]",
    "[bed][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=300[duck]",
    "[narr][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]",
  );
  const output = path.join(dir, "sound", "mix.wav");
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", output);
  await run("ffmpeg", args, {
    timeout: 1800000,
    onChild: (c) => (job.abort = () => c.kill()),
  });
  const measured = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      output,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    { timeout: 1800000, onChild: (c) => (job.abort = () => c.kill()) },
  );
  const match = measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  project.mix = "sound/mix.wav";
  project.mixReport = {
    ambience: `${clips.length} timeline clips`,
    targetLUFS: -16,
    clips,
    measurement: match ? JSON.parse(match[0]) : null,
  };
  atomic(path.join(dir, "sound", "mix-report.json"), project.mixReport);
}

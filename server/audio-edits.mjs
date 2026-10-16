import fs from "node:fs";
import path from "node:path";
import { run, safePath, uid, atomic } from "./core.mjs";
const finite = (v, min, max, label) => {
  if (!Number.isFinite(v) || v < min || v > max)
    throw Error(`${label} must be between ${min} and ${max}`);
  return v;
};
export function protectedPauses(pauses, words, guard = 0.06) {
  let result = [];
  for (const pause of pauses) {
    let ranges = [{ start: pause.start, end: pause.end }];
    for (const word of words || []) {
      const a = Math.max(0, word.start - guard),
        b = word.end + guard;
      ranges = ranges.flatMap((r) =>
        b <= r.start || a >= r.end
          ? [r]
          : [
              a > r.start ? { start: r.start, end: a } : null,
              b < r.end ? { start: b, end: r.end } : null,
            ].filter(Boolean),
      );
    }
    result.push(...ranges.filter((r) => r.end - r.start >= 0.12));
  }
  return result.map((r, i) => ({
    ...r,
    id: `pause-${i}`,
    duration: r.end - r.start,
  }));
}
export function trimPlan(duration, pauses, reduction) {
  finite(duration, 0.01, 86400, "Duration");
  finite(reduction, 0, 100, "Pause reduction");
  const cuts = pauses
    .map((p) => {
      finite(p.start, 0, duration, "Pause start");
      finite(p.end, p.start, duration, "Pause end");
      const removed = (Math.max(0, p.end - p.start - 0.12) * reduction) / 100,
        middle = (p.start + p.end) / 2;
      return { start: middle - removed / 2, end: middle + removed / 2 };
    })
    .filter((c) => c.end - c.start >= 0.01)
    .sort((a, b) => a.start - b.start);
  return cutPlan(duration, cuts);
}
export function cutPlan(duration, cuts) {
  finite(duration, 0.01, 86400, "Duration");
  cuts = cuts
    .map((c) => ({
      start: finite(c.start, 0, duration, "Cut start"),
      end: finite(c.end, c.start, duration, "Cut end"),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cut of cuts) {
    const last = merged.at(-1);
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  let cursor = 0,
    output = 0;
  const segments = [];
  for (const cut of [...merged, { start: duration, end: duration }]) {
    if (cut.start - cursor > 0.001) {
      const fade = segments.length
        ? Math.min(
            0.02,
            (cut.start - cursor) / 4,
            (segments.at(-1).end - segments.at(-1).start) / 4,
          )
        : 0;
      output -= fade;
      segments.push({
        start: cursor,
        end: cut.start,
        outputStart: output,
        crossfade: fade,
      });
      output += cut.start - cursor;
    }
    cursor = Math.max(cursor, cut.end);
  }
  return { cuts: merged, segments, duration: output };
}
export function mapEditedTime(t, plan) {
  const segment = plan.segments.find((s) => t >= s.start && t <= s.end);
  if (segment) return segment.outputStart + t - segment.start;
  const next = plan.segments.find((s) => s.start > t);
  return next?.outputStart ?? plan.duration;
}
export async function analyzeSilence(store, p, options = {}) {
  if (!p.audio) throw Error("Add a voiceover or camera recording first");
  const thresholdDb = finite(
      Number(options.thresholdDb ?? -38),
      -70,
      -15,
      "Silence threshold",
    ),
    minPause = finite(Number(options.minPause ?? 0.3), 0.1, 5, "Minimum pause");
  const source = safePath(store.projectDir(p.id), p.audio),
    stat = fs.statSync(source);
  const result = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      source,
      "-af",
      `silencedetect=noise=${thresholdDb}dB:d=${minPause}`,
      "-f",
      "null",
      "-",
    ],
    { timeout: 600000 },
  );
  const pauses = [];
  let start;
  for (const match of result.stderr.matchAll(
    /silence_(start|end):\s*([\d.]+)/g,
  )) {
    const time = Number(match[2]);
    if (match[1] === "start") start = time;
    else if (start != null) {
      pauses.push({ start, end: Math.min(p.durationSec, time) });
      start = undefined;
    }
  }
  if (start != null && p.durationSec > start)
    pauses.push({ start, end: p.durationSec });
  const analysis = {
    id: uid(),
    projectId: p.id,
    source: p.audio,
    sourceBytes: stat.size,
    sourceMtime: stat.mtimeMs,
    thresholdDb,
    minPause,
    duration: p.durationSec,
    pauses: protectedPauses(pauses, p.words),
    createdAt: new Date().toISOString(),
  };
  store.put("audioAnalyses", analysis);
  return analysis;
}
function retimeScene(scene, start, newStart, plan) {
  if (!scene) return scene;
  const local = (value) =>
    Math.max(0, mapEditedTime(start + value, plan) - newStart);
  return {
    ...scene,
    elements: scene.elements.map((e) => {
      const keyframes = e.keyframes
        ?.map((k) => ({ ...k, time: local(k.time) }))
        .filter(
          (k, i, all) => i === all.length - 1 || k.time < all[i + 1].time,
        );
      return {
        ...e,
        delay: local(e.delay || 0),
        duration: Math.max(
          0.05,
          local((e.delay || 0) + e.duration) - local(e.delay || 0),
        ),
        ...(keyframes ? { keyframes } : {}),
      };
    }),
  };
}
function cameraCuts(oldCuts, segments) {
  const prior = oldCuts?.length
    ? oldCuts
    : [{ outputStart: 0, outputEnd: Infinity, sourceStart: 0 }];
  return segments.flatMap((s) =>
    prior.flatMap((c) => {
      const start = Math.max(s.start, c.outputStart),
        end = Math.min(s.end, c.outputEnd);
      return end > start
        ? [
            {
              outputStart: s.outputStart + start - s.start,
              outputEnd: s.outputStart + end - s.start,
              sourceStart: c.sourceStart + start - c.outputStart,
              sourceEnd: c.sourceStart + end - c.outputStart,
            },
          ]
        : [];
    }),
  );
}
export async function applySilenceTrim(store, p, job) {
  const a = store.get("audioAnalyses", job.options.analysisId);
  if (!a || a.projectId !== p.id || a.source !== p.audio)
    throw Error("Analyze the current recording before trimming");
  const dir = store.projectDir(p.id),
    source = safePath(dir, p.audio),
    stat = fs.statSync(source);
  if (stat.size !== a.sourceBytes || stat.mtimeMs !== a.sourceMtime)
    throw Error("Recording changed. Analyze it again.");
  const selected = job.options.selectedPauses ?? a.pauses.map((p) => p.id);
  if (
    !Array.isArray(selected) ||
    selected.some((id) => !a.pauses.some((p) => p.id === id))
  )
    throw Error("Choose detected pauses from this recording");
  const plan = trimPlan(
    a.duration,
    a.pauses.filter((p) => selected.includes(p.id)),
    Number(job.options.reduction ?? 65),
  );
  if (!plan.cuts.length) throw Error("No pause reduction is selected");
  return applyAudioPlan(store, p, job, plan);
}
export async function applyAudioPlan(
  store,
  p,
  job,
  plan,
  removedWords = new Set(),
) {
  const dir = store.projectDir(p.id),
    source = safePath(dir, p.audio);
  if (!plan.segments.length || plan.duration < 0.1)
    throw Error("Keep at least part of the recording");
  const output = `audio/voiceover.trimmed-${uid()}.wav`,
    filter = plan.segments.map(
      (s, i) =>
        `[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`,
    );
  let last = "a0";
  for (let i = 1; i < plan.segments.length; i++) {
    const next = `join${i}`;
    filter.push(
      `[${last}][a${i}]acrossfade=d=${plan.segments[i].crossfade}:c1=tri:c2=tri[${next}]`,
    );
    last = next;
  }
  const filterFile = path.join(dir, "audio", `.trim-${job.id}.txt`);
  atomic(filterFile, filter.join(";"));
  try {
    await run(
      "ffmpeg",
      [
        "-y",
        "-i",
        source,
        "-filter_complex_script",
        filterFile,
        "-map",
        `[${last}]`,
        "-ac",
        "1",
        "-ar",
        "48000",
        path.join(dir, output),
      ],
      { timeout: 1800000, onChild: (c) => (job.abort = () => c.kill()) },
    );
  } finally {
    fs.rmSync(filterFile, { force: true });
  }
  p.audioEdits = [
    ...(p.audioEdits || []),
    {
      source: p.audio,
      output,
      cuts: plan.cuts,
      segments: plan.segments,
      reduction: job.options.reduction ?? 65,
      crossfadeMs: 20,
      previousDuration: p.durationSec,
      createdAt: new Date().toISOString(),
    },
  ];
  p.words = (p.words || [])
    .filter((w, i) => !removedWords.has(i))
    .map((w) => ({
      ...w,
      start: mapEditedTime(w.start, plan),
      end: mapEditedTime(w.end, plan),
    }));
  p.shots = (p.shots || [])
    .map((s) => {
      const start = mapEditedTime(s.start, plan),
        end = mapEditedTime(s.end, plan);
      return {
        ...s,
        start,
        end,
        scene: retimeScene(s.scene, s.start, start, plan),
        ...(removedWords.size
          ? {
              narration: p.words
                .filter((w) => w.start >= start && w.start < end)
                .map((w) => w.w)
                .join(" "),
            }
          : {}),
      };
    })
    .filter((s) => s.end - s.start > 0.01);
  if (p.sourceVideo) p.cameraCuts = cameraCuts(p.cameraCuts, plan.segments);
  if (p.timeline)
    p.timeline = {
      cues: p.timeline.cues
        .filter((c) => p.shots.some((s) => s.id === c.shotId))
        .map((c) => {
          const shot = p.shots.find((s) => s.id === c.shotId);
          return {
            ...c,
            time: Math.max(
              shot?.start || 0,
              Math.min(
                (shot?.end ?? plan.duration) - 0.001,
                mapEditedTime(c.time, plan),
              ),
            ),
          };
        }),
      cards: p.timeline.cards
        .map((c) => ({
          ...c,
          start: mapEditedTime(c.start, plan),
          end: mapEditedTime(c.end, plan),
        }))
        .filter((c) => c.end - c.start > 0.01),
      audio: p.timeline.audio
        .map((c) => {
          const start = mapEditedTime(c.start, plan),
            end = mapEditedTime(c.end, plan);
          return {
            ...c,
            start,
            end,
            fadeIn: Math.min(c.fadeIn || 0, (end - start) / 2),
            fadeOut: Math.min(c.fadeOut || 0, (end - start) / 2),
          };
        })
        .filter((c) => c.end - c.start > 0.01),
    };
  p.audio = output;
  p.durationSec = plan.duration;
  p.mix = null;
  p.lastExport = null;
  p.pipeline.soundDesign = "pending";
  p.pipeline.exported = "pending";
  atomic(path.join(dir, "words.json"), p.words);
  atomic(path.join(dir, "storyboard.json"), { shots: p.shots });
  for (const s of p.shots)
    if (s.scene) {
      atomic(path.join(dir, "scenes", s.id + ".json"), s.scene);
      atomic(
        path.join(dir, "scenes", s.id + ".js"),
        `export default ${JSON.stringify(s.scene)};\n`,
      );
    }
  atomic(
    path.join(dir, "audio", "script_timed.txt"),
    p.words
      .map((w) => `[${w.start.toFixed(3)} → ${w.end.toFixed(3)}] ${w.w}`)
      .join("\n"),
  );
  return plan;
}

import fs from "node:fs";
import crypto from "node:crypto";
import { safePath, uid, atomic } from "./core.mjs";
import path from "node:path";
import { cutPlan, applyAudioPlan } from "./audio-edits.mjs";
const transcriptHash = (p) =>
  crypto.createHash("sha256").update(JSON.stringify(p.words)).digest("hex");
const normalize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function validateRetakes(candidates, words) {
  if (!Array.isArray(candidates) || candidates.length > 200)
    throw Error("Retake analysis must contain at most 200 candidates");
  const valid = [];
  for (const item of candidates) {
    const { removeStart, removeEnd, keepStart, keepEnd } = item;
    if (
      ![removeStart, removeEnd, keepStart, keepEnd].every(Number.isInteger) ||
      removeStart < 0 ||
      removeEnd < removeStart ||
      keepStart <= removeEnd ||
      keepEnd < keepStart ||
      keepEnd >= words.length
    )
      continue;
    const removed = words.slice(removeStart, removeEnd + 1),
      kept = words.slice(keepStart, keepEnd + 1);
    // A supported automatic retake is a repeated spoken opening. The later
    // complete take must remain outside every proposed removal.
    const a = removed.map((w) => normalize(w.w)).filter(Boolean),
      b = kept.map((w) => normalize(w.w)).filter(Boolean);
    let shared = 0;
    while (shared < Math.min(a.length, b.length) && a[shared] === b[shared])
      shared++;
    if (
      shared < 3 ||
      kept.length < removed.length * 0.5 ||
      typeof item.reason !== "string"
    )
      continue;
    valid.push({
      id: uid(),
      removeStart,
      removeEnd,
      keepStart,
      keepEnd,
      reason: item.reason.slice(0, 500),
      removed: removed.map((w) => w.w).join(" "),
      kept: kept.map((w) => w.w).join(" "),
    });
  }
  return valid
    .filter(
      (item) =>
        !valid.some(
          (other) =>
            other !== item &&
            other.removeStart <= item.keepEnd &&
            other.removeEnd >= item.keepStart,
        ),
    )
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            other.removeStart === item.removeStart &&
            other.removeEnd === item.removeEnd,
        ) === index,
    );
}
export function saveRetakeAnalysis(store, p, candidates) {
  if (!p.audio || !p.words?.length)
    throw Error("Import camera footage or time the narration first");
  const stat = fs.statSync(safePath(store.projectDir(p.id), p.audio));
  const analysis = {
    id: uid(),
    projectId: p.id,
    source: p.audio,
    bytes: stat.size,
    mtime: stat.mtimeMs,
    wordsHash: transcriptHash(p),
    takes: validateRetakes(candidates, p.words),
    createdAt: new Date().toISOString(),
  };
  store.put("takeAnalyses", analysis);
  return analysis;
}
export async function applyRetakes(store, p, job) {
  const analysis = store.get("takeAnalyses", job.options.analysisId);
  if (
    !analysis ||
    analysis.projectId !== p.id ||
    analysis.source !== p.audio ||
    analysis.wordsHash !== transcriptHash(p)
  )
    throw Error("Recording or transcript changed. Analyze retakes again.");
  const stat = fs.statSync(safePath(store.projectDir(p.id), p.audio));
  if (stat.size !== analysis.bytes || stat.mtimeMs !== analysis.mtime)
    throw Error("Recording changed. Analyze retakes again.");
  const selected = job.options.selected;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.some((id) => !analysis.takes.some((t) => t.id === id))
  )
    throw Error("Choose proposed retakes from this analysis");
  const takes = analysis.takes.filter((t) => selected.includes(t.id)),
    removed = new Set(),
    cuts = [];
  for (const take of takes) {
    for (let i = take.removeStart; i <= take.removeEnd; i++) removed.add(i);
    const first = p.words[take.removeStart],
      last = p.words[take.removeEnd],
      prev = p.words[take.removeStart - 1],
      next = p.words[take.removeEnd + 1];
    cuts.push({
      start: prev
        ? Math.max(prev.end + 0.03, first.start - 0.04)
        : Math.max(0, first.start - 0.04),
      end: next
        ? Math.min(next.start - 0.03, last.end + 0.04)
        : Math.min(p.durationSec, last.end + 0.04),
    });
  }
  if (removed.size >= p.words.length)
    throw Error("Keep at least one complete take");
  const plan = cutPlan(p.durationSec, cuts);
  await applyAudioPlan(store, p, job, plan, removed);
  p.sourceTranscript ||= p.script;
  p.script = p.words.map((w) => w.w).join(" ");
  p.needsReview = true;
  p.takeEdits = [
    ...(p.takeEdits || []),
    {
      analysisId: analysis.id,
      removedWords: removed.size,
      takes,
      at: new Date().toISOString(),
    },
  ];
  atomic(path.join(store.projectDir(p.id), "script.txt"), p.script);
  return { plan, removedWords: removed.size };
}

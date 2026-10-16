import { uid } from "./core.mjs";
export function saveLearning(store, job, evidence, suggestions) {
  const evidenceIds = new Set(
    [...(evidence.comments || []), ...(evidence.retention || [])].map(
      (item) => item.id,
    ),
  );
  suggestions = suggestions.filter(
    (s) =>
      typeof s.rule === "string" &&
      s.rule.trim() &&
      Array.isArray(s.evidence) &&
      s.evidence.length &&
      s.evidence.every((id) => evidenceIds.has(id)),
  );
  const automatic =
    job.options.autoApply === true && store.settings().autoLearn === true;
  const report = {
    id: uid(),
    projectId: job.projectId,
    workspaceId: job.workspaceId || "personal",
    videoId: evidence.videoId,
    evidence,
    suggestions,
    approved: [],
    automatic,
    createdAt: new Date().toISOString(),
  };
  if (automatic)
    for (const [index, suggestion] of suggestions.entries()) {
      // Automatic rules need corroboration in at least two distinct supplied
      // evidence records. A single comment remains a proposal for review.
      if (new Set(suggestion.evidence).size < 2) continue;
      store.put("memory", {
        id: `${report.id}-${index}`,
        text: suggestion.rule,
        projectId:
          store.settings().learningScope === "project" ? job.projectId : null,
        evidence: suggestion.evidence,
        sourceVideoId: evidence.videoId,
        automatic: true,
        updatedAt: new Date().toISOString(),
      });
      report.approved.push(index);
    }
  store.put("learnings", report);
  return report;
}
export function queueAudienceLearning(
  store,
  pipeline,
  vault,
  now = Date.now(),
) {
  if (!store.settings().autoLearn || !vault.has("googleTokens")) return;
  const interval =
    Math.max(
      12,
      Math.min(168, Number(store.settings().learningIntervalHours) || 48),
    ) * 3600000;
  for (const upload of store
    .all("uploads")
    .filter((u) => u.status === "done" && u.videoId)) {
    const p = store.get("projects", upload.projectId);
    if (
      !p ||
      Date.parse(upload.publishAt || upload.createdAt) > now - 24 * 3600000 ||
      Date.parse(upload.lastLearningAt || 0) > now - interval
    )
      continue;
    if (
      store
        .all("jobs")
        .some(
          (j) =>
            j.action === "learn" &&
            j.options?.videoId === upload.videoId &&
            ["queued", "running", "paused"].includes(j.status),
        )
    )
      continue;
    upload.lastLearningAt = new Date(now).toISOString();
    store.put("uploads", upload);
    pipeline.enqueue(p.id, "learn", {
      videoId: upload.videoId,
      autoApply: true,
    });
  }
}

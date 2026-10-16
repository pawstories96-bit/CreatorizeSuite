export const workflowStages = [
  "idea",
  "script",
  "voiceover",
  "building",
  "review",
  "ready",
  "scheduled",
  "published",
];
export const workflowLabel = (value) =>
  value.charAt(0).toUpperCase() + value.slice(1);
export function projectStage(p) {
  if (workflowStages.includes(p.kanbanStage)) return p.kanbanStage;
  if (["ready", "scheduled", "published"].includes(p.status)) return p.status;
  if (p.pipeline?.scenes === "done") return "review";
  if (p.pipeline?.scenes === "running" || p.status === "editing")
    return "building";
  if (p.audio) return "voiceover";
  return p.script?.trim() ? "script" : "idea";
}

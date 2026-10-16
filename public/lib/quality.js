export const qualityLevels = [
  "Standard",
  "More Depth",
  "Polished",
  "Verified",
  "Ultra Edit",
  "Ultra Edit+",
];
export const qualityDescriptions = [
  "One scene generation with rendered layout checks and validation retries.",
  "Adds subject-specific assemblies, connected structures and environmental detail using available assets.",
  "Adds a separate pass for camera curves, easing, poses and transitions.",
  "Adds independent start/middle/end image review, enlarged detail crops and repair attempts.",
  "Adds a specialist upgrade through your Ultra role model, with before/after motion previews and independent image review.",
  "Generates a target from the current frame through your configured image provider, then runs a bounded scene-matching loop and independent image review. Image provider charges or local compute apply.",
];
export function qualityIndex(value) {
  return (
    { Draft: 0, Detailed: 1, "More depth": 1, Ultra: 4 }[value] ??
    Math.max(0, qualityLevels.indexOf(value))
  );
}

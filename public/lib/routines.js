export function fullChannelRoutine() {
  const steps = [
    ["schedule", "Schedule", {}],
    ["topics", "Topic finder & duplicate guard", {}],
    [
      "create",
      "Create project",
      { style: "3d", look: "Studio", targetLengthSec: 300 },
    ],
    ["script", "Research, verify & write", {}],
    ["script-rules", "Enforce script rules", {}],
    ["tts", "Voiceover & word timing", { provider: "windows" }],
    ["build", "Build scenes", { quality: "Verified" }],
    ["qa", "Independent quality check", { vision: true }],
    ["mix", "Music, ambience & sound", {}],
    ["export", "Render video", { resolution: "1080p", fps: 60 }],
    ["thumbnail", "Create thumbnail", {}],
    ["metadata", "Title, description & chapters", {}],
    ["approval", "Review exported video", {}],
    [
      "finish",
      "Reframe, upload, stage & notify",
      { reframe: true, upload: false, stage: "ready", notify: true },
    ],
  ];
  return {
    nodes: steps.map(([action, label, options], index) => ({
      id: `step-${index + 1}`,
      type: "step",
      position: {
        x: (index % 2) * 360 + 80,
        y: Math.floor(index / 2) * 170 + 50,
      },
      data: { action, label, options },
    })),
    edges: steps
      .slice(1)
      .map((_, index) => ({
        id: `edge-${index + 1}`,
        source: `step-${index + 1}`,
        target: `step-${index + 2}`,
        animated: true,
      })),
  };
}

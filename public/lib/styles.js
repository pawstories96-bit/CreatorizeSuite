export const geometryTypes = [
  "terrain",
  "model",
  "building3d",
  "vessel3d",
  "box",
  "sphere",
  "cylinder",
  "cone",
  "plane",
  "torus",
  "tube",
  "capsule",
  "mannequin",
  "particles",
  "extrusion",
  "water",
  "evidence-board",
];
export const styleProfiles = [
  {
    id: "3d",
    name: "3D reconstruction",
    look: "Studio",
    looks: ["Studio", "Investigation"],
    color: "#c8d4df",
    description:
      "Complete environments, faceless white figures, real assets and cinematic reconstructions.",
    options: [
      "realPhotos",
      "photosPerMinute",
      "webModels",
      "realMaps",
      "character",
    ],
    guide:
      "Build coherent physical worlds at meter scale. Studio: full natural environments with sky/horizon, terrain, vegetation and buildings where appropriate, real colored materials, natural shadows and smooth faceless white human figures with anatomically articulated limbs. Use blue sparingly to identify an individual, unless the project cast specifies another color. Establish geography, then track action, then show a meaningful close-up; reuse the same location and hero geometry. At most two small labels in ordinary 3D shots, often none. Reserve isolated white-clay or dark cutaways for explicit mechanism explanations, and archival/document cards for separate evidence shots. Investigation is a lighting/material look for ANY topic, including sports, business, history and science: dark environments, one motivated cool key, glossy faceless people and restrained subject highlights. Add crime/evidence-board imagery only when the actual narration calls for it. Never invent suspects, crimes, red strings or police for unrelated topics. Retrieve and actually use relevant licensed GLB assets; build specific connected machinery when no exact model exists. Never use unexplained blocks as specialist machinery or put flat 2D people inside a physical reconstruction.",
  },
  {
    id: "lowpoly",
    name: "Low-poly 3D Shorts",
    look: "Bright",
    looks: ["Bright", "Moody", "Retro PS1"],
    color: "#a4b9e0",
    description:
      "Vertical worlds, expressive low-poly actors and retro camera animation.",
    options: ["character", "realPhotos", "webModels"],
    guide:
      "Use low-poly geometry, complete small environments, expressive articulated actors, strong silhouettes and tightly framed 9:16 compositions. Bright uses clean saturated daylight; Moody uses fog and contrast; Retro PS1 uses vertex snapping, a restricted palette and film grain. Animate actions and expressions, not only camera orbit.",
  },
  {
    id: "pixel",
    name: "Pixel art",
    look: "Crisp 640",
    looks: ["Crisp 640", "Expanded palette"],
    color: "#b6d5c1",
    description:
      "A fixed 640-pixel canvas with crisp sprites, limited color and motion.",
    options: ["paletteSize", "realPhotos"],
    guide:
      "Render pixel-aligned scenes at 640×360 or 360×640 internally. Use a readable limited palette, layered silhouettes, deliberate sprite motion and short pixel labels. Footage belongs in clearly framed screens or PIP cards. Keep small details and labels readable after pixel scaling.",
  },
  {
    id: "paint",
    name: "MS Paint explainer",
    look: "Classic Paint",
    looks: ["Classic Paint", "Paper & ink"],
    color: "#ded3b3",
    description:
      "Programmatic backgrounds, expressive reusable characters and hand-drawn details.",
    options: ["character", "realPhotos", "photosPerMinute"],
    guide:
      "Use clean light backgrounds, deliberately hand-drawn outlined props, rough ink strokes, original scene-specific details and expressive reusable character rigs/sprites. Change the composition with the narration instead of stacking generic slide cards. Reuse character assets consistently while changing pose and expression.",
  },
  {
    id: "flat",
    name: "Flat vector explainer",
    look: "Bold & bright",
    looks: ["Bold & bright", "Soft editorial"],
    color: "#a8c9ee",
    description:
      "Rigged vector characters, clear diagrams and precise motion graphics.",
    options: ["character", "realPhotos"],
    guide:
      "Build layered vector illustrations with articulated characters, expressive faces, coherent proportions, readable diagrams and natural transitions. Use a restrained palette, correct joints and purposeful timing. Avoid generic rectangles with narration text.",
  },
  {
    id: "collage",
    name: "Vox collage",
    look: "Broadsheet",
    looks: ["Broadsheet", "Evidence paper"],
    color: "#e0be81",
    description:
      "Paper cutouts, halftones, ink stamps, archival evidence and animated charts.",
    options: ["realPhotos", "photosPerMinute"],
    guide:
      "Use textured paper layers, clipped archival photography, halftone shading, serif headlines, ink stamps, red annotations and animated quantitative charts. Make evidence and narrative structure visible. Preserve factual values in charts; never invent data.",
  },
  {
    id: "talking",
    name: "Talking-head hybrid",
    look: "Clean edit",
    looks: ["Clean edit", "Documentary overlay"],
    color: "#c7b6a2",
    description:
      "Synced camera footage, silence/take edits, B-roll and motion graphic overlays.",
    options: ["realPhotos", "photosPerMinute"],
    guide:
      "Keep the source camera performance as the visual foundation. Use deliberate B-roll, restrained motion graphics, captions and diagrams that support the speaker. Preserve lip sync and intentional breathing; do not cover the face with labels or replace source performance with generic scenes.",
  },
];
export const getStyleProfile = (id) =>
  styleProfiles.find((s) => s.id === id) ||
  styleProfiles.find((s) => s.id === "flat");

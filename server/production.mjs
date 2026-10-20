import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { atomic, read, safePath } from "./core.mjs";
import { searchModels, downloadModel } from "./models.mjs";

export const studioDirection = `Studio reconstruction means a complete inhabited physical world: terrain/ground, horizon/sky for exteriors, buildings/vegetation where appropriate, foreground/middle/background depth, motivated light and shadows. Use naturally proportioned faceless white 3D people, with blue only to identify a specific person. Never use flat character2d icons in a physical reconstruction. Use colored real materials for vessels, equipment, landscape and buildings. Reserve empty backgrounds and isolated cutaways for explicit technical explanations. Reuse the same environment, coordinates, hero assemblies and assets across related shots. Alternate establishing, tracking/POV and mechanism close-ups according to the narration; animate the event itself. Most shots need zero text; at most two small factual labels. Do not cover the scene with diagrams, clocks, title cards, narration text or repeated RECONSTRUCTION labels. The player supplies a discreet reconstruction label. Use detailed building3d environments and, where appropriate, the generic authored vessel3d assembly. Use model instances to populate scenery densely. Do not stretch an unsuitable small toy model into a historically distinctive hero; choose bespoke geometry or a suitable assembly, and retrieve fitting CC0 component/environment assets instead. Do not copy the reference's story, branding or assets or claim a generic model is a precise historical replica.`;
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const planText = (max) =>
  z.preprocess(
    (v) => (v && typeof v === "object" ? JSON.stringify(v) : v),
    z.string().min(1).max(max),
  );
const planSchema = z.object({
  sets: z
    .array(
      z.object({
        id: key,
        name: z.string().min(1).max(160),
        description: planText(6000),
      }),
    )
    .min(1)
    .max(16),
  assets: z
    .array(
      z.object({
        key,
        query: z.string().min(2).max(150),
        purpose: planText(2000),
      }),
    )
    .max(10),
  shots: z.array(
    z.object({
      shotId: key,
      setId: key,
      kind: z.enum(["environment", "technical", "evidence"]),
      focus: planText(2500),
      camera: planText(2500),
      action: planText(2500),
      assetKeys: z.array(key).max(10),
    }),
  ),
});
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const assetLedger = (store, p) =>
  read(path.join(store.projectDir(p.id), "assets", "ATTRIBUTIONS.json"), []);
export const isStudio = (p) => (p.baseStyle || p.style) === "3d";
export function reconstructionDirection(p) {
  const base =
    p.look === "Investigation"
      ? studioDirection.replace(
          "Use naturally proportioned faceless white 3D people, with blue only to identify a specific person.",
          "Use naturally proportioned faceless 3D people with project role colors and glossy finishes. Investigation is a lighting/material look for any topic. Crime boards, suspects or police require support in the actual narration; do not invent a crime for sports, business, science or history.",
        )
      : studioDirection;
  return (
    base +
    (p.cast
      ? ` Project cast overrides default body, color and finish: ${JSON.stringify(p.cast)}. Evaluate these selected appearances; do not request white or blue in place of an explicit project choice.`
      : "")
  );
}

export async function prepareProduction(store, p, job, generate, emit) {
  const direction = job.options.direction || p.direction || "";
  const fingerprint = hash({
    version: 2,
    style: p.style,
    look: p.look,
    format: p.format,
    direction,
    shots: p.shots.map(({ id, narration, start, end }) => ({
      id,
      narration,
      start,
      end,
    })),
  });
  const policy =
    job.options.assetPolicy === "procedural" ? "procedural" : "automatic";
  const save = () => {
    store.saveProject(p);
    atomic(
      path.join(store.projectDir(p.id), "production-plan.json"),
      p.production,
    );
  };
  if (
    p.production?.fingerprint !== fingerprint ||
    p.production?.policy !== policy
  ) {
    emit(
      "info",
      "Planning shared 3D environments, shot actions and licensed asset searches before building",
    );
    const input = await generate(
      `Plan this documentary's 3D production BEFORE writing scenes. ${reconstructionDirection(p)}\nTitle: ${p.title}. Direction: ${direction}. Timed shots: ${JSON.stringify(p.shots.map(({ id, narration, start, end }) => ({ id, narration, start, end })))}\nReturn JSON {sets:[{id,name,description}],assets:[{key,query,purpose}],shots:[{shotId,setId,kind:'environment'|'technical'|'evidence',focus,camera,action,assetKeys:[]}]}. Include EVERY shot exactly once. All descriptive fields (description, focus, camera, action, purpose) should be concise strings, ideally under 800 characters. IDs use only letters, digits, underscores or hyphens. Share sets for the same location. Set descriptions must specify consistent scale, physical layout, real materials, time of day and hero assemblies. At most 10 reusable asset queries. Search simple generic nouns (e.g. 'cargo ship', 'tree', 'warehouse'), not historical names or a whole sentence. Asset keys per shot mean the model will actually be visible in that shot; avoid irrelevant props. Exact mechanisms and historical structures may require bespoke connected geometry. Differentiate exterior worlds, technical close-ups and authentic evidence cuts. Do not fabricate asset paths or source claims.`,
      "plan",
    );
    const plan = planSchema.parse(input),
      ids = new Set(p.shots.map((s) => s.id));
    if (
      plan.shots.length !== ids.size ||
      new Set(plan.shots.map((s) => s.shotId)).size !== ids.size ||
      plan.shots.some((s) => !ids.has(s.shotId))
    )
      throw Error("Production plan must include every shot exactly once");
    if (
      new Set(plan.sets.map((s) => s.id)).size !== plan.sets.length ||
      new Set(plan.assets.map((a) => a.key)).size !== plan.assets.length
    )
      throw Error("Production plan contains duplicate set or asset IDs");
    for (const shot of plan.shots) {
      if (
        !plan.sets.some((s) => s.id === shot.setId) ||
        shot.assetKeys.some((k) => !plan.assets.some((a) => a.key === k))
      )
        throw Error("Production plan refers to an unknown set or asset");
    }
    p.production = {
      version: 2,
      fingerprint,
      policy,
      status: "planning",
      ...plan,
      acquired: [],
      searches: [],
      worlds: {},
      createdAt: new Date().toISOString(),
    };
    save();
  }
  const production = p.production;
  if (policy === "procedural") {
    production.status = "ready";
    production.note =
      "Web retrieval was explicitly disabled for this build. Bespoke procedural geometry only.";
    save();
    return production;
  }
  if (!production.choices) {
    const candidates = [];
    for (const asset of production.assets) {
      if (job.cancelled) throw Error("Stopped by user");
      if (!production.shots.some((s) => s.assetKeys.includes(asset.key)))
        continue;
      emit("info", `Searching public CC0 models: ${asset.query}`);
      const results = (await searchModels(store, asset.query)).slice(0, 12);
      candidates.push({ key: asset.key, purpose: asset.purpose, results });
      production.searches.push({
        key: asset.key,
        query: asset.query,
        results: results.map(({ id, name, source }) => ({ id, name, source })),
        at: new Date().toISOString(),
      });
      save();
    }
    const selection = await generate(
      `Choose relevant models from these REAL CC0 search results for ${p.title}. ${reconstructionDirection(p)}\n${JSON.stringify(candidates)}\nReturn JSON {choices:[{key,id:string|null,reason:string}]}, exactly one per candidate key. Copy IDs exactly. Use null and a specific bespoke-geometry reason if no candidate actually fits; never choose an unrelated object to increase an asset count. Generic stylized models are visual proxies, not historically exact replicas. Support props and vegetation can be reused across a full environment.`,
      "plan",
    );
    if (
      !Array.isArray(selection.choices) ||
      selection.choices.length !== candidates.length ||
      new Set(selection.choices.map((c) => c.key)).size !== candidates.length
    )
      throw Error("Model selection omitted a required asset decision");
    for (const choice of selection.choices) {
      const candidate = candidates.find((c) => c.key === choice.key);
      if (
        !candidate ||
        !choice.reason?.trim() ||
        (choice.id !== null &&
          !candidate.results.some((r) => r.id === choice.id))
      )
        throw Error("Agent selected a model outside the actual search results");
    }
    production.choices = selection.choices;
    save();
  }
  production.acquired = production.acquired.filter((a) =>
    production.choices.some((c) => c.key === a.key && c.id === a.id),
  );
  for (const choice of production.choices.filter((c) => c.id)) {
    const cached = production.acquired.find((a) => a.key === choice.key);
    if (
      cached &&
      cached.id === choice.id &&
      fs.existsSync(safePath(store.projectDir(p.id), cached.path)) &&
      hashFile(safePath(store.projectDir(p.id), cached.path)) === cached.sha256
    )
      continue;
    const record = await downloadModel(store, p, choice.id, job, emit);
    production.acquired = [
      ...production.acquired.filter((a) => a.key !== choice.key),
      { key: choice.key, reason: choice.reason, ...record },
    ];
    save();
    emit(
      "success",
      `Saved actual CC0 geometry: ${record.name} (${record.path})`,
    );
  }
  if (
    !production.acquired.length &&
    !assetLedger(store, p).some((a) => a.path?.endsWith(".glb"))
  ) {
    production.status = "needs-assets";
    save();
    throw Error(
      "No suitable 3D assets were acquired. Review the production plan in Assets, import a suitable GLB, revise the build direction, or explicitly choose procedural geometry in Build. The app will not silently claim it used web models.",
    );
  }
  production.status = "ready";
  delete production.error;
  save();
  return production;
}
const hashFile = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function productionContext(p, shot) {
  const plan = p.production,
    spec = plan?.shots.find((s) => s.shotId === shot.id);
  if (!spec) return "";
  const assets = plan.acquired.filter((a) => spec.assetKeys.includes(a.key));
  const world = spec.kind === "environment" && plan.worlds?.[spec.setId];
  return `\n## Shared production plan\n${reconstructionDirection(p)}\nSet: ${JSON.stringify(plan.sets.find((s) => s.id === spec.setId))}. Shot: ${JSON.stringify(spec)}.\nRequired visible models with exact native bounds and scaling: ${JSON.stringify(assets)}. Bespoke decisions: ${JSON.stringify(plan.choices?.filter((a) => spec.assetKeys.includes(a.key) && !a.id))}.\n${world ? `Reuse this existing environment without redesigning it: ${JSON.stringify(world)}. Return {reuseSet:true,removeIds:[...],elements:[new or changed elements],camera,cameraRig,...} to retain its existing world geometry while changing the framing/action. IDs in elements replace the corresponding existing elements. Existing 2D overlays are not inherited. You may also return a full scene. Keep location layout and actual assets consistent.` : "Build the shared physical set so later shots can reuse it. Use scene.environment:{kind:'exterior'|'interior'|'technical',skyTop:'#hex',skyHorizon:'#hex'} for a sky that appears in water reflections. Use cameraFov 30..65 and cameraRig.target/to/targetTo/easing for deliberate framing. All geometry widths and heights must be <=4000; a 2000-meter ground/water area is sufficient for most establishing views."}`;
}

export function composeProductionScene(p, shot, scene) {
  if (!scene.reuseSet) return scene;
  const spec = p.production?.shots.find((s) => s.shotId === shot.id),
    world = p.production?.worlds?.[spec?.setId];
  if (!world) throw Error("This shot has no saved environment to reuse");
  const patches = new Map((scene.elements || []).map((e) => [e.id, e]));
  return {
    ...structuredClone(world),
    ...scene,
    elements: [
      ...world.elements.filter(
        (e) =>
          ![
            "text",
            "rect",
            "circle",
            "line",
            "path",
            "image",
            "video",
            "character2d",
          ].includes(e.type) &&
          !patches.has(e.id) &&
          !(scene.removeIds || []).includes(e.id),
      ),
      ...(scene.elements || []),
    ],
  };
}

export function productionIssues(p, shot, qa) {
  const spec = p.production?.shots.find((s) => s.shotId === shot.id);
  if (!spec) return [];
  const elements = shot.scene.elements,
    issues = [];
  if (spec.kind === "environment") {
    const labels = elements.filter((e) => e.type === "text");
    if (labels.length > 2)
      issues.push(
        "Studio environment shots permit at most two short labels; tell the story with the world and camera",
      );
    if (
      labels.some(
        (e) => e.text.length > 100 || e.fontSize > 42 || e.height > 100,
      )
    )
      issues.push(
        "Keep Studio labels short and small; use a separate evidence shot for a title or document",
      );
    if (elements.some((e) => e.type === "character2d"))
      issues.push(
        "Use natural 3D figures in the reconstruction instead of flat character icons",
      );
  }
  const paths = new Set(
    elements
      .filter((e) => e.type === "model" && e.opacity > 0.01)
      .map((e) => e.src),
  );
  for (const a of p.production.acquired.filter((a) =>
    spec.assetKeys.includes(a.key),
  )) {
    if (!paths.has(a.path))
      issues.push(
        `The planned downloaded ${a.key} model is missing from the scene: ${a.path}`,
      );
    else if (qa && !qa.visibleModelPaths.includes(a.path))
      issues.push(
        `The planned ${a.key} model is not visible in sampled frames; correct its position, scale and camera`,
      );
  }
  return issues;
}

export function rememberWorld(p, shot) {
  const spec = p.production?.shots.find((s) => s.shotId === shot.id);
  const first =
    spec &&
    p.shots.find((s) =>
      p.production.shots.some(
        (v) =>
          v.shotId === s.id &&
          v.setId === spec.setId &&
          v.kind === "environment",
      ),
    );
  if (
    spec?.kind === "environment" &&
    (!p.production.worlds[spec.setId] || first?.id === shot.id)
  )
    p.production.worlds[spec.setId] = structuredClone(shot.scene);
  if (spec)
    shot.production = {
      version: 2,
      fingerprint: p.production.fingerprint,
      setId: spec.setId,
      kind: spec.kind,
      modelPaths: shot.scene.elements
        .filter((e) => e.type === "model")
        .map((e) => e.src),
    };
}

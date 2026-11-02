import * as THREE from "/vendor/three.module.js";
import * as K from "./kit3d.js";
import * as V from "./vehicles.js";
import * as M from "./maps.js";
import { LOOKS } from "./looks.js";
import { reconstructionLooks } from "./catalog.js";

export async function prepareReconstruction(project) {
  const kinds = new Set(
    project.shots.flatMap((s) =>
      (s.scene?.elements || []).map((e) => e.reconstruction?.kind),
    ),
  );
  await M.prepareMaps(kinds);
  if (project.shots.some((s) => s.scene?.evidence))
    await Promise.all(
      [400, 600, 700, 800].map((weight) =>
        document.fonts.load(`${weight} 32px Inter`),
      ),
    );
}
export function reconstructionLook(project, scene) {
  if (project.style !== "3d") return undefined;
  return LOOKS[scene.reconstructionLook || reconstructionLooks[project.look]];
}
export function applyReconstructionLook(project, scene) {
  if (project.style !== "3d") return scene;
  const look = reconstructionLook(project, scene);
  if (!look) return scene;
  // Per-shot looks take precedence over the project look; project controls are applied afterward.
  return {
    ...scene,
    background: look.bg,
    environment: {
      kind: look.sky.type === "gradient" ? "exterior" : "technical",
      skyTop: look.sky.zenith || look.bg,
      skyHorizon: look.sky.horizon || look.bg,
    },
    lighting: {
      ambient: look.hemi.intensity,
      key: look.sun.intensity,
      position: {
        x: look.sun.dir[0] * 20,
        y: look.sun.dir[1] * 20,
        z: look.sun.dir[2] * 20,
      },
    },
    effects: {
      ...scene.effects,
      ssao: true,
      bloom: look.bloom,
      outline: false,
      fog: undefined,
    },
  };
}
export function createReconstructionObject(e) {
  K.resetMaterialCache();
  const { kind, options = {}, motion, route, pins } = e.reconstruction;
  const o = { ...options };
  const root = new THREE.Group();
  let built, animate;
  const progress = (t) =>
    Math.max(
      0,
      Math.min(
        1,
        (t - (motion?.delay || 0)) / (motion?.duration || e.duration || 5),
      ),
    );
  if (kind === "coaster" || kind === "train") {
    // No hidden procedural passengers: actors use Creatorize's explicit cast system.
    if (kind === "coaster")
      built = K.coaster({
        ...o,
        chain: o.chain ?? false,
        catwalk: o.catwalk ?? false,
      });
    else {
      built = K.train({ ...o, riders: false });
      const path = K.path(o.points, { closed: o.closed ?? true });
      animate = (t) =>
        built.place(
          path,
          (motion?.from || 0) +
            ((motion?.to ?? path.L) - (motion?.from || 0)) * progress(t),
        );
    }
  } else if (kind === "worldMap" || kind === "usMap") {
    built = M[kind](o);
    if (route) {
      const line = M.route(built, route, { radius: 0.25 });
      built.group.add(line);
      animate = (t) => line.setProgress(progress(t));
    }
    const markers = (pins || []).map(([lon, lat]) =>
      M.pin(built, lon, lat, { r: 0.6, glow: 0 }),
    );
    built.group.add(...markers);
    const routeAnimate = animate;
    animate = (t) => {
      routeAnimate?.(t);
      markers.forEach((pin) => pin.animate(t));
    };
  } else if (kind === "cabin") built = V.cabin({ ...o, passengers: 0 });
  else if (kind === "cockpit") built = V.cockpit(o);
  else if (kind === "sign") built = K.sign(e.text || "RECONSTRUCTION", o);
  else if (kind === "railing") built = K.railing(o.points, o);
  else if (kind === "forest")
    built = K.forest({ ...o, count: o.count ?? 180, rMax: o.rMax ?? 80 });
  else built = (V[kind] || K[kind])(o);
  const object = built.group || built;
  root.add(object);
  if (built.setDoor && motion)
    animate = (t) =>
      built.setDoor(motion.from + (motion.to - motion.from) * progress(t));
  if (!animate && typeof built.animate === "function")
    animate = (t) => built.animate(t);
  root.userData.animate = animate;
  root.userData.animateAfterOpacity = true;
  // Materials/textures belong to this object, never to a different shot.
  root.traverse((mesh) => {
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    for (const m of Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []) {
      m.userData.alpha = m.opacity;
      m.userData.ownedTextures = Object.values(m).filter((v) => v?.isTexture);
    }
  });
  animate?.(0);
  return root;
}

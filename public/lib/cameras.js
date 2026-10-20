export const cameraMoves = [
  ["locked", "Locked composition"],
  ["push-in", "Slow push in"],
  ["pull-back", "Pull back reveal"],
  ["orbit-left", "Orbit left"],
  ["orbit-right", "Orbit right"],
  ["truck-left", "Track left"],
  ["truck-right", "Track right"],
  ["crane-rise", "Crane rise"],
  ["reveal-drop", "Descend reveal"],
  ["overhead-drift", "Overhead drift"],
];
export function resolveCamera(scene, duration = 4) {
  const r = scene.cameraRig;
  if (!r?.preset) return scene;
  const target = r.target || { x: 0, y: 1, z: 0 },
    d = r.distance || 12,
    h = r.height ?? d * 0.45,
    a = ((r.azimuth ?? 35) * Math.PI) / 180,
    move = r.amount ?? 0.22,
    from = {
      x: target.x + Math.sin(a) * d,
      y: target.y + h,
      z: target.z + Math.cos(a) * d,
    },
    to = { ...from },
    targetTo = { ...target };
  if (["orbit-left", "orbit-right"].includes(r.preset))
    return {
      ...scene,
      camera: from,
      cameraRig: {
        ...r,
        type: "orbit",
        duration: r.duration || duration,
        angle: (r.preset === "orbit-left" ? -1 : 1) * move * 90,
        easing: r.easing || "smooth",
      },
    };
  if (r.preset === "push-in" || r.preset === "pull-back") {
    const k = r.preset === "push-in" ? 1 - move : 1 + move;
    for (const axis of ["x", "y", "z"])
      to[axis] = target[axis] + (from[axis] - target[axis]) * k;
  }
  if (r.preset.startsWith("truck-")) {
    const sign = r.preset === "truck-left" ? -1 : 1;
    to.x += Math.cos(a) * d * move * sign;
    to.z -= Math.sin(a) * d * move * sign;
    targetTo.x += to.x - from.x;
    targetTo.z += to.z - from.z;
  }
  if (r.preset === "crane-rise") to.y += d * move;
  if (r.preset === "reveal-drop") to.y -= d * move;
  if (r.preset === "overhead-drift") {
    from.y = target.y + d;
    from.x = target.x + d * 0.05;
    from.z = target.z + d * 0.05;
    to.x = from.x + d * move;
    to.y = from.y;
    to.z = from.z;
  }
  return {
    ...scene,
    camera: from,
    cameraRig: {
      ...r,
      type: "dolly",
      target,
      targetTo,
      to,
      duration: r.duration || duration,
      easing: r.easing || "smooth",
    },
  };
}

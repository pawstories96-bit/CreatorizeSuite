import * as THREE from "/vendor/three.module.js";
const aliases = {
  "hip-1": ["leftupleg", "leftupperleg", "thighl", "jbiplupperleg"],
  "knee-1": ["leftleg", "leftlowerleg", "calfl", "jbipllowerleg"],
  "foot-1": ["leftfoot", "footl", "jbiplfoot"],
  hip1: ["rightupleg", "rightupperleg", "thighr", "jbiprupperleg"],
  knee1: ["rightleg", "rightlowerleg", "calfr", "jbiprlowerleg"],
  foot1: ["rightfoot", "footr", "jbiprfoot"],
  "shoulder-1": ["leftarm", "leftupperarm", "upperarml", "jbiplupperarm"],
  "elbow-1": ["leftforearm", "leftlowerarm", "lowerarml", "jbipllowerarm"],
  "wrist-1": ["lefthand", "handl", "jbiplhand"],
  shoulder1: ["rightarm", "rightupperarm", "upperarmr", "jbiprupperarm"],
  elbow1: ["rightforearm", "rightlowerarm", "lowerarmr", "jbiprlowerarm"],
  wrist1: ["righthand", "handr", "jbiprhand"],
};
export function skeletonMap(root) {
  const map = {};
  root.traverse((o) => {
    const name = o.name
      .toLowerCase()
      .replace(/^mixamorig\d*[:_]?/, "")
      .replace(/[^a-z0-9]/g, "");
    for (const [key, names] of Object.entries(aliases))
      if (names.includes(name)) {
        const target = key.endsWith("-1")
          ? key.slice(0, -2) + "1"
          : key.slice(0, -1) + "-1";
        map[target] = o;
      }
  });
  return map;
}
export function normalizeMotion(root, clip, name) {
  if (
    !clip ||
    !Number.isFinite(clip.duration) ||
    clip.duration <= 0 ||
    clip.duration > 120
  )
    throw Error("Choose an animation lasting up to 120 seconds");
  const map = skeletonMap(root),
    missing = Object.keys(aliases).filter((k) => !map[k]);
  if (missing.length)
    throw Error(
      "Could not map humanoid limbs: " +
        missing.join(", ") +
        ". Use standard Mixamo, Unity, Unreal or VRM bone names.",
    );
  root.updateMatrixWorld(true);
  const sourceHeight = Math.max(
      0.001,
      map["hip-1"]
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(map["knee-1"].getWorldPosition(new THREE.Vector3())) +
        map["knee-1"]
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(map["foot-1"].getWorldPosition(new THREE.Vector3())),
    ),
    mixer = new THREE.AnimationMixer(root),
    frames = [],
    fps = 30,
    down = new THREE.Vector3(0, -1, 0);
  mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  for (let i = 0; i <= Math.ceil(clip.duration * fps); i++) {
    const time = Math.min(clip.duration, i / fps);
    mixer.setTime(Math.min(time, Math.max(0, clip.duration - 0.00001)));
    root.updateMatrixWorld(true);
    const left = map.hip1.getWorldPosition(new THREE.Vector3()),
      right = map["hip-1"].getWorldPosition(new THREE.Vector3()),
      axis = left.clone().sub(right),
      bodyRotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(-axis.z, axis.x),
      ),
      inverseBody = bodyRotation.clone().invert(),
      rotations = {};
    for (const side of [-1, 1])
      for (const [a, b, c] of [
        [`hip${side}`, `knee${side}`, `foot${side}`],
        [`shoulder${side}`, `elbow${side}`, `wrist${side}`],
      ]) {
        const pa = map[a].getWorldPosition(new THREE.Vector3()),
          pb = map[b].getWorldPosition(new THREE.Vector3()),
          pc = map[c].getWorldPosition(new THREE.Vector3()),
          upper = new THREE.Quaternion().setFromUnitVectors(
            down,
            pb.sub(pa).normalize().applyQuaternion(inverseBody),
          ),
          lower = new THREE.Quaternion().setFromUnitVectors(
            down,
            pc
              .sub(map[b].getWorldPosition(new THREE.Vector3()))
              .normalize()
              .applyQuaternion(inverseBody),
          );
        rotations[a] = upper.toArray();
        rotations[b] = upper.clone().invert().multiply(lower).toArray();
      }
    frames.push({
      time,
      rotations,
      bodyRotation: bodyRotation.toArray(),
      hipHeight: ((left.y + right.y) / 2 / sourceHeight) * 0.83,
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const baseline = frames[0].hipHeight;
  frames.forEach((f) => {
    f.offsetY = Math.max(-0.85, Math.min(2, f.hipHeight - baseline));
    delete f.hipHeight;
  });
  return {
    version: 1,
    name,
    duration: clip.duration,
    fps,
    mapping: Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, v.name]),
    ),
    frames,
  };
}
export function motionAnimator(motion, loop = true) {
  const a = new THREE.Quaternion(),
    b = new THREE.Quaternion();
  return (time, joints, body) => {
    const t = loop
        ? Math.max(0, time) % motion.duration
        : Math.min(motion.duration, Math.max(0, time)),
      frames = motion.frames;
    let hi = frames.findIndex((f) => f.time >= t);
    if (hi < 0) hi = frames.length - 1;
    const lo = Math.max(0, hi - 1),
      u =
        (t - frames[lo].time) /
        Math.max(0.00001, frames[hi].time - frames[lo].time);
    for (const [key, q] of Object.entries(frames[lo].rotations)) {
      if (!joints[key]) continue;
      a.fromArray(q);
      b.fromArray(frames[hi].rotations[key] || q);
      joints[key].quaternion.slerpQuaternions(a, b, u);
    }
    body.position.y =
      ((frames[lo].offsetY || 0) * (1 - u) + (frames[hi].offsetY || 0) * u) *
      body.scale.y;
    a.fromArray(frames[lo].bodyRotation || [0, 0, 0, 1]);
    b.fromArray(frames[hi].bodyRotation || [0, 0, 0, 1]);
    body.quaternion.slerpQuaternions(a, b, u);
  };
}

import * as THREE from "/vendor/three.module.js";
export const actorMotions = [
  "idle",
  "walk",
  "run",
  "sit",
  "sit-down",
  "stand-up",
  "point",
  "wave",
  "talk",
  "phone",
  "carry",
  "reach",
  "crouch",
  "celebrate",
  "fall",
];
const down = new THREE.Vector3(0, -1, 0),
  clamp = (n) => Math.max(0, Math.min(1, n));
export function createMannequin(e, project, material) {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    s = e.height / 1.8,
    female = e.body === "female",
    detail = project.style === "lowpoly" ? 8 : 20,
    joints = {},
    fingers = {},
    wrists = {};
  root.add(body);
  body.scale.setScalar(s);
  material.clearcoat = e.finish === "glossy" ? 0.65 : 0;
  material.clearcoatRoughness = 0.2;
  if (e.finish === "glossy") {
    material.roughness = 0.19;
    material.metalness = 0.16;
  }
  if (e.finish === "glow") {
    material.roughness = 0.36;
    material.emissive.copy(material.color);
    material.emissiveIntensity = 0.65;
  }
  const mesh = (name, g, x, y, z, parent = body, mat = material) => {
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.userData.part = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const oval = (name, x, y, z, rx, ry, rz, parent = body) => {
    const m = mesh(
      name,
      new THREE.SphereGeometry(1, detail, 12),
      x,
      y,
      z,
      parent,
    );
    m.scale.set(rx, ry, rz);
    return m;
  };
  const joint = (name, parent, x, y, z) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    joints[name] = o;
    return o;
  };
  const limb = (name, length, radius, parent) =>
    mesh(
      name,
      new THREE.CapsuleGeometry(
        radius,
        Math.max(0.001, length - radius * 2),
        4,
        detail,
      ),
      0,
      -length / 2,
      0,
      parent,
    );
  oval("pelvis", 0, 0.91, 0, female ? 0.18 : 0.165, 0.15, 0.12);
  const torso = mesh(
    "torso",
    new THREE.CylinderGeometry(
      female ? 0.175 : 0.205,
      female ? 0.12 : 0.135,
      0.38,
      detail,
    ),
    0,
    1.18,
    0,
  );
  torso.scale.z = 0.62;
  oval("chest", 0, 1.34, 0.005, female ? 0.175 : 0.205, 0.115, 0.12);
  if (female)
    for (const side of [-1, 1])
      oval("chest-contour", side * 0.075, 1.3, 0.07, 0.075, 0.075, 0.065);
  mesh(
    "neck",
    new THREE.CylinderGeometry(0.052, 0.06, 0.115, detail),
    0,
    1.48,
    0,
  );
  oval("head", 0, 1.655, 0.005, 0.105, 0.145, 0.115);
  const shoulderX = female ? 0.195 : 0.225;
  for (const side of [-1, 1]) {
    const hip = joint(
      `hip${side}`,
      body,
      side * (female ? 0.11 : 0.1),
      0.91,
      0,
    );
    limb("thigh", 0.43, female ? 0.085 : 0.083, hip);
    const knee = joint(`knee${side}`, hip, 0, -0.43, 0);
    oval("knee", 0, 0, 0, 0.062, 0.062, 0.065, knee);
    limb("shin", 0.4, 0.055, knee);
    oval("foot", 0, -0.42, 0.065, 0.062, 0.06, 0.135, knee);
    const shoulder = joint(`shoulder${side}`, body, side * shoulderX, 1.38, 0);
    oval("shoulder", 0, 0, 0, 0.078, 0.085, 0.08, shoulder);
    limb("upper-arm", 0.29, 0.055, shoulder);
    const elbow = joint(`elbow${side}`, shoulder, 0, -0.29, 0);
    oval("elbow", 0, 0, 0, 0.045, 0.046, 0.045, elbow);
    limb("forearm", 0.25, 0.042, elbow);
    const wrist = joint(`wrist${side}`, elbow, 0, -0.25, 0);
    wrists[side] = wrist;
    oval("palm", 0, -0.035, 0, 0.038, 0.05, 0.022, wrist);
    fingers[side] = [];
    for (let f = 0; f < 4; f++) {
      const base = joint(
        `finger${side}-${f}`,
        wrist,
        (f - 1.5) * 0.018,
        -0.068,
        0,
      );
      let parent = base;
      const chain = [];
      for (let k = 0; k < 3; k++) {
        const part =
          k === 0
            ? base
            : joint(`finger${side}-${f}-${k}`, parent, 0, -0.021, 0);
        limb("finger", 0.021, 0.0075, part);
        chain.push(part);
        parent = part;
      }
      fingers[side].push(chain);
    }
    const thumb = joint(`thumb${side}`, wrist, side * 0.034, -0.027, 0.008);
    thumb.rotation.z = side * 0.7;
    limb("thumb", 0.045, 0.011, thumb);
  }
  if (project.style === "lowpoly") {
    const face = new THREE.MeshBasicMaterial({ color: "#17202b" });
    for (const side of [-1, 1])
      mesh(
        "eye",
        new THREE.SphereGeometry(0.012, 6, 6),
        side * 0.038,
        1.675,
        0.11,
        body,
        face,
      );
    mesh(
      "mouth",
      new THREE.BoxGeometry(
        0.045,
        e.expression === "surprised" ? 0.035 : 0.009,
        0.008,
      ),
      0,
      1.6,
      0.115,
      body,
      face,
    );
  }
  const propSpec =
      e.heldProp ||
      (e.pose === "phone" ? { kind: "phone", hand: "right" } : null),
    heldSides = propSpec
      ? propSpec.hand === "both"
        ? [-1, 1]
        : [propSpec.hand === "left" ? 1 : -1]
      : [];
  if (propSpec) {
    const prop = createHandProp(propSpec.kind),
      side = heldSides.at(-1);
    prop.name = "held-" + propSpec.kind;
    prop.position.set(0, -0.035, 0.028);
    wrists[side].add(prop);
    // The grip is centered on the palm; segmented fingers curl around the handle.
    for (const which of heldSides)
      for (const chain of fingers[which])
        chain.forEach((j, i) => (j.rotation.x = -(i === 0 ? 0.55 : 1.05)));
  }
  function armTo(side, target) {
    const shoulder = joints[`shoulder${side}`],
      elbow = joints[`elbow${side}`],
      origin = shoulder.position.clone(),
      delta = new THREE.Vector3(...target).sub(origin),
      distance = Math.min(0.535, Math.max(0.08, delta.length())),
      dir = delta.normalize(),
      a = (0.29 ** 2 - 0.25 ** 2 + distance ** 2) / (2 * distance),
      alt = Math.sqrt(Math.max(0, 0.29 ** 2 - a * a)),
      bend = new THREE.Vector3(side * 0.8, -0.25, -0.5)
        .addScaledVector(
          dir,
          -new THREE.Vector3(side * 0.8, -0.25, -0.5).dot(dir),
        )
        .normalize(),
      elbowPoint = origin
        .clone()
        .addScaledVector(dir, a)
        .addScaledVector(bend, alt),
      upper = elbowPoint.clone().sub(origin).normalize();
    shoulder.quaternion.setFromUnitVectors(down, upper);
    const lower = origin
      .clone()
      .addScaledVector(dir, distance)
      .sub(elbowPoint)
      .normalize()
      .applyQuaternion(shoulder.quaternion.clone().invert());
    elbow.quaternion.setFromUnitVectors(down, lower);
    // Keep the palm/prop orientation independent of the changing elbow angle.
    wrists[side].quaternion
      .copy(shoulder.quaternion)
      .multiply(elbow.quaternion)
      .invert();
  }
  root.userData.joints = joints;
  root.userData.animate = (t) => {
    const pose = e.pose,
      walking = ["walk", "run"].includes(pose),
      phase = t * (pose === "run" ? 9 : 4.5) + (e.phase || 0),
      gait = walking ? Math.sin(phase) * (pose === "run" ? 0.65 : 0.38) : 0,
      q = clamp((t - e.delay) / Math.max(0.05, e.duration)),
      ease = q * q * (3 - 2 * q),
      seated =
        pose === "sit"
          ? 1
          : pose === "sit-down"
            ? ease
            : pose === "stand-up"
              ? 1 - ease
              : 0;
    body.position.y =
      -0.43 * (1 - Math.cos((seated * Math.PI) / 2)) * s +
      (walking ? Math.abs(Math.sin(phase)) * 0.018 * s : 0);
    body.rotation.set(
      0,
      0,
      pose === "fall" ? Math.min(Math.PI / 2, t * 0.8) : 0,
    );
    for (const side of [-1, 1]) {
      const hip = joints[`hip${side}`],
        knee = joints[`knee${side}`],
        arm = joints[`shoulder${side}`],
        elbow = joints[`elbow${side}`];
      hip.rotation.set(side * gait - (seated * Math.PI) / 2, 0, 0);
      knee.rotation.set(
        (walking ? Math.max(0, -side * gait) * 1.4 : 0) +
          (seated * Math.PI) / 2,
        0,
        0,
      );
      arm.rotation.set(-side * gait * 0.65 - seated * 0.23, 0, side * 0.045);
      elbow.rotation.set(seated ? -1 : walking ? -0.18 : -0.055, 0, 0);
      wrists[side].rotation.set(0, 0, 0);
      if (pose === "point" && side === 1) {
        arm.rotation.x = -1.3;
        elbow.rotation.x = -0.15;
      }
      if (pose === "wave" && side === 1) {
        arm.rotation.z = -2.45;
        elbow.rotation.z = Math.sin(t * 4) * 0.32;
      }
      if (pose === "talk") {
        arm.rotation.x = -0.25 - Math.sin(t * 2 + side) * 0.12;
        elbow.rotation.x = -0.5 - Math.sin(t * 2.6 + side) * 0.22;
      }
      if (pose === "reach") {
        arm.rotation.x = -1.4;
        elbow.rotation.x = -0.15;
      }
      if (pose === "celebrate") {
        arm.rotation.z = -side * 2.5;
        elbow.rotation.x = -0.3;
      }
      if (pose === "crouch") {
        hip.rotation.x = -0.8;
        knee.rotation.x = 1.6;
        body.position.y = -0.26 * s;
      }
      if (heldSides.includes(side)) {
        if (propSpec.kind === "phone" && pose === "phone") {
          armTo(side, [side * 0.15, 1.63, 0.02]);
          wrists[side].rotation.z = (side * Math.PI) / 2;
        } else if (propSpec.hand === "both") {
          armTo(side, [side * 0.13, 1.04, 0.32]);
          wrists[side].rotation.z = (side * Math.PI) / 2;
        } else if (["briefcase", "bag"].includes(propSpec.kind))
          armTo(side, [side * 0.29, 0.83, 0.045]);
        else armTo(side, [side * 0.22, 1.06, 0.32]);
      }
    }
    if (root.userData.motion)
      root.userData.motion(t * e.motionSpeed, joints, body);
  };
  root.userData.animate(0);
  return root;
}
export function createHandProp(kind) {
  const root = new THREE.Group(),
    dark = new THREE.MeshStandardMaterial({
      color: "#252b32",
      roughness: 0.45,
    }),
    light = new THREE.MeshStandardMaterial({
      color: "#dddcd6",
      roughness: 0.7,
    });
  const add = (g, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    root.add(o);
    return o;
  };
  if (kind === "phone" || kind === "scanner") {
    add(new THREE.BoxGeometry(0.067, 0.135, 0.015), dark, 0, 0, 0.012);
    add(
      new THREE.BoxGeometry(0.054, 0.104, 0.002),
      new THREE.MeshStandardMaterial({
        color: kind === "phone" ? "#436a7e" : "#b8443b",
        emissive: "#162c3b",
        emissiveIntensity: 0.2,
      }),
      0,
      0.007,
      0.021,
    );
  } else if (kind === "cup") {
    add(
      new THREE.CylinderGeometry(0.041, 0.032, 0.1, 20),
      light,
      0,
      -0.015,
      0.015,
    );
    const handle = add(
      new THREE.TorusGeometry(0.026, 0.007, 8, 16),
      light,
      0.052,
      -0.015,
      0.015,
    );
    handle.rotation.y = Math.PI / 2;
  } else if (kind === "paper") {
    add(new THREE.BoxGeometry(0.22, 0.008, 0.29), light, 0, 0.015, 0.1);
  } else if (kind === "staff" || kind === "bat") {
    const shaft = add(
      new THREE.CylinderGeometry(
        kind === "bat" ? 0.032 : 0.014,
        0.014,
        kind === "bat" ? 0.85 : 1.35,
        16,
      ),
      new THREE.MeshStandardMaterial({ color: "#98764b", roughness: 0.6 }),
      0,
      0.24,
      0.015,
    );
    shaft.rotation.z = kind === "bat" ? 0.2 : 0;
  } else {
    add(
      new THREE.BoxGeometry(0.25, 0.2, kind === "bag" ? 0.15 : 0.07),
      dark,
      0,
      -0.19,
      0,
    );
    add(
      new THREE.TorusGeometry(0.038, 0.009, 8, 16, Math.PI),
      dark,
      0,
      -0.055,
      0,
    );
  }
  return root;
}

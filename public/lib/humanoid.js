import * as THREE from "/vendor/three.module.js";
import { createMannequin, createHandProp } from "./mannequins.js";
import { skeletonMap, motionAnimator } from "./motion.js";
const nameOf = (o) =>
  o.name
    .toLowerCase()
    .replace(/^mixamorig\d*[:_]?/, "")
    .replace(/[^a-z0-9]/g, "");

// Retarget directions rather than copying local rotations between rigs with
// different bind axes. The imported mesh/skin stays intact; no mesh substitute.
export function driveHumanoid(model, container, e, motion) {
  const skeletons = new Set();
  model.traverse((o) => {
    if (o.isSkinnedMesh) skeletons.add(o.skeleton);
  });
  skeletons.forEach((s) => s.pose());
  model.updateMatrixWorld(true);
  const mapped = skeletonMap(model),
    bones = [],
    names = new Map();
  model.traverse((o) => {
    if (o.isBone) {
      bones.push({ node: o, q: o.quaternion.clone(), p: o.position.clone() });
      names.set(nameOf(o), o);
    }
  });
  const required = [
      "hip-1",
      "knee-1",
      "foot-1",
      "hip1",
      "knee1",
      "foot1",
      "shoulder-1",
      "elbow-1",
      "wrist-1",
      "shoulder1",
      "elbow1",
      "wrist1",
    ],
    missing = required.filter((k) => !mapped[k]),
    hips = names.get("hips") || names.get("pelvis");
  if (missing.length || !hips || !skeletons.size)
    throw Error(
      "This character cannot use humanoid actions. Missing mapped bones: " +
        (missing.join(", ") || "hips/skinned mesh") +
        ". Use its embedded clip or import a standard Mixamo rig.",
    );
  const control = createMannequin(
      { ...e, type: "mannequin", height: e.fitHeight || 1.8, role: "neutral" },
      { style: "3d" },
      new THREE.MeshBasicMaterial(),
    ),
    joints = control.userData.joints,
    body = control.children[0];
  if (motion) control.userData.motion = motionAnimator(motion, e.loop);
  const restHips = hips.quaternion.clone(),
    restPosition = hips.position.clone(),
    propSpec =
      e.heldProp ||
      (e.pose === "phone" ? { kind: "phone", hand: "right" } : null),
    prop = propSpec ? createHandProp(propSpec.kind) : null;
  if (prop) {
    model.add(prop);
    prop.traverse((o) => (o.userData.id = e.id));
  }
  const v = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    outerQ = new THREE.Quaternion(),
    outerScale = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3();
  const desired = (joint) =>
    v
      .set(0, -1, 0)
      .applyQuaternion(joint.getWorldQuaternion(q))
      .applyQuaternion(outerQ)
      .normalize()
      .clone();
  function aim(node, child, direction) {
    if (!node || !child) return;
    const current = child
      .getWorldPosition(b)
      .sub(node.getWorldPosition(a))
      .normalize();
    if (current.lengthSq() < 0.5) return;
    const worldQ = node.getWorldQuaternion(new THREE.Quaternion()),
      rotation = new THREE.Quaternion()
        .setFromUnitVectors(current, direction)
        .multiply(worldQ),
      parent = node.parent.getWorldQuaternion(new THREE.Quaternion());
    node.quaternion.copy(parent.invert().multiply(rotation));
    node.updateMatrixWorld(true);
  }
  container.userData.animate = (t) => {
    for (const item of bones) {
      item.node.quaternion.copy(item.q);
      item.node.position.copy(item.p);
    }
    control.userData.animate(t);
    control.updateMatrixWorld(true);
    container.updateMatrixWorld(true);
    container.getWorldQuaternion(outerQ);
    container.getWorldScale(outerScale);
    const parentQ = hips.parent.getWorldQuaternion(new THREE.Quaternion()),
      baseQ = parentQ.clone().multiply(restHips),
      yaw = body.quaternion.clone();
    hips.quaternion.copy(
      parentQ
        .clone()
        .invert()
        .multiply(
          outerQ
            .clone()
            .multiply(yaw)
            .multiply(outerQ.clone().invert())
            .multiply(baseQ),
        ),
    );
    const shift = new THREE.Vector3(0, body.position.y * outerScale.y, 0)
      .applyQuaternion(parentQ.clone().invert())
      .divide(hips.parent.getWorldScale(new THREE.Vector3()));
    hips.position.copy(restPosition).add(shift);
    model.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      aim(
        mapped[`hip${side}`],
        mapped[`knee${side}`],
        desired(joints[`hip${side}`]),
      );
      aim(
        mapped[`knee${side}`],
        mapped[`foot${side}`],
        desired(joints[`knee${side}`]),
      );
      aim(
        mapped[`shoulder${side}`],
        mapped[`elbow${side}`],
        desired(joints[`shoulder${side}`]),
      );
      aim(
        mapped[`elbow${side}`],
        mapped[`wrist${side}`],
        desired(joints[`elbow${side}`]),
      );
      const prefix = side === 1 ? "left" : "right",
        hand = mapped[`wrist${side}`],
        middle = names.get(prefix + "handmiddle1");
      aim(hand, middle, desired(joints[`wrist${side}`]));
      for (const [f, finger] of ["index", "middle", "ring", "pinky"].entries())
        for (let k = 0; k < 3; k++) {
          const node = names.get(`${prefix}hand${finger}${k + 1}`),
            child =
              names.get(`${prefix}hand${finger}${k + 2}`) ||
              node?.children.find((o) => o.isBone),
            target = joints[`finger${side}-${f}${k ? "-" + k : ""}`];
          if (target) aim(node, child, desired(target));
        }
      const thumb = names.get(prefix + "handthumb1"),
        thumbChild = names.get(prefix + "handthumb2");
      aim(thumb, thumbChild, desired(joints[`thumb${side}`]));
    }
    if (prop) {
      const side = propSpec.hand === "left" ? 1 : -1,
        hand = mapped[`wrist${side}`],
        target = joints[`wrist${side}`],
        orientation = outerQ
          .clone()
          .multiply(target.getWorldQuaternion(new THREE.Quaternion())),
        position = hand.getWorldPosition(new THREE.Vector3()).add(
          new THREE.Vector3(0, -0.035, 0.028)
            .multiplyScalar((e.fitHeight || 1.8) / 1.8)
            .multiply(outerScale)
            .applyQuaternion(orientation),
        );
      prop.position.copy(model.worldToLocal(position));
      prop.quaternion.copy(
        model
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(orientation),
      );
      prop.scale
        .copy(outerScale)
        .multiplyScalar((e.fitHeight || 1.8) / 1.8)
        .divide(model.getWorldScale(new THREE.Vector3()));
    }
  };
  container.userData.disposeControl = () =>
    control.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
  container.userData.humanoid = {
    bones: required.length,
    fingerBones: bones.filter((x) =>
      /hand(index|middle|ring|pinky)/.test(nameOf(x.node)),
    ).length,
  };
  container.userData.animate(0);
}

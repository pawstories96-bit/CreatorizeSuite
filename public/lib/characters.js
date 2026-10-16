// Articulated 2D rig. Time is supplied by the shared player, so previews,
// backward seeks and exports use the same shoulder, elbow, hip and knee poses.
export function drawCharacter2d(c, e, t, style) {
  const r = {
    skin: "#dba87f",
    hair: "#28333e",
    shirt: "#4c8b9b",
    trousers: "#263d54",
    shoes: "#202c35",
    outline: "#20303a",
    headScale: 1,
    bodyScale: 1,
    limbScale: 1,
    hairStyle: "short",
    accessory: "none",
    silhouette: "human",
    ...e.rig2d,
  };
  c.save();
  c.scale(e.width / 260, e.height / 350);
  c.translate(0, Math.sin(t * 2) * (e.pose === "idle" ? 1.5 : 0));
  if (e.pose === "fall") c.rotate(Math.min(Math.PI / 2, t * 0.8));
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = style === "paint" ? 3.5 : 2;
  c.strokeStyle = r.outline;
  const shape = (x, y, w, h, color, round = 8) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x - w / 2, y - h / 2, w, h, round);
    c.fill();
    c.stroke();
  };
  const disk = (x, y, radius, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  };
  const walking = e.pose === "walk" || e.pose === "run",
    cycle = t * (e.pose === "run" ? 10 : 5),
    gait = walking ? 0.5 : 0.025,
    limb = r.limbScale;
  const hipY = 47 * r.bodyScale;
  for (const side of [-1, 1]) {
    const phase = cycle + (side < 0 ? Math.PI : 0),
      swing = Math.sin(phase) * gait;
    c.save();
    c.translate(side * 15, hipY);
    c.rotate(e.pose === "sit" ? -1.25 : swing);
    shape(
      0,
      27 * limb,
      r.silhouette === "stick" ? 8 : 22,
      54 * limb,
      r.trousers,
    );
    c.translate(0, 54 * limb);
    c.rotate(
      walking
        ? Math.max(0, Math.sin(phase + 0.6)) * 0.65
        : e.pose === "sit"
          ? 1.4
          : 0.025,
    );
    shape(
      0,
      25 * limb,
      r.silhouette === "stick" ? 7 : 19,
      50 * limb,
      r.trousers,
    );
    shape(5, 51 * limb, 32, 14, r.shoes, 5);
    c.restore();
  }
  shape(
    0,
    2,
    r.silhouette === "stick" ? 13 : 63,
    93 * r.bodyScale,
    r.shirt,
    r.silhouette === "robot" ? 4 : 14,
  );
  if (r.silhouette === "robot") {
    shape(0, -3, 27, 25, r.trousers, 2);
    disk(0, -3, 5, r.skin);
  }
  for (const side of [-1, 1]) {
    const swing = -Math.sin(cycle + (side < 0 ? Math.PI : 0)) * gait * 0.75;
    c.save();
    c.translate(side * (r.silhouette === "stick" ? 12 : 33), -31);
    c.rotate(e.pose === "point" && side > 0 ? -1.4 : swing + side * -0.05);
    shape(0, 18, r.silhouette === "stick" ? 8 : 20, 36, r.shirt);
    c.translate(0, 35);
    c.rotate(e.pose === "point" && side > 0 ? -0.15 : walking ? -0.25 : -0.08);
    shape(0, 23 * limb, r.silhouette === "stick" ? 7 : 15, 46 * limb, r.skin);
    disk(0, 49 * limb, r.silhouette === "stick" ? 6 : 9, r.skin);
    c.restore();
  }
  shape(0, -58, 20, 23, r.skin, 5);
  c.save();
  c.translate(0, -101);
  c.rotate(Math.sin(t * 1.3) * 0.012);
  c.scale(r.headScale, r.headScale);
  if (r.silhouette === "robot") shape(0, 0, 68, 69, r.skin, 7);
  else disk(0, 0, 35, r.skin);
  if (r.hairStyle !== "none") {
    c.fillStyle = r.hair;
    c.beginPath();
    c.arc(0, -6, 35, Math.PI, Math.PI * 2);
    c.lineTo(35, -3);
    c.quadraticCurveTo(4, -28, -35, -2);
    c.closePath();
    c.fill();
    c.stroke();
    if (r.hairStyle === "bob") {
      shape(-32, 0, 13, 58, r.hair, 6);
      shape(32, 0, 13, 58, r.hair, 6);
    }
    if (r.hairStyle === "curly")
      for (let i = 0; i < 6; i++)
        disk(-27 + i * 11, -28 - Math.sin((i / 5) * Math.PI) * 8, 10, r.hair);
  }
  const blink = t % 4.3 < 0.13;
  for (const side of [-1, 1]) {
    c.fillStyle = r.outline;
    c.beginPath();
    c.ellipse(side * 12, -1, 3.2, blink ? 0.7 : 4, 0, 0, Math.PI * 2);
    c.fill();
    if (e.expression === "angry" || e.expression === "sad") {
      c.beginPath();
      c.moveTo(side * 6, -12);
      c.lineTo(side * 19, e.expression === "angry" ? -17 : -9);
      c.stroke();
    }
  }
  c.beginPath();
  if (e.expression === "surprised") c.ellipse(0, 17, 5, 8, 0, 0, Math.PI * 2);
  else {
    c.moveTo(-10, 16);
    c.quadraticCurveTo(
      0,
      e.expression === "happy" ? 29 : e.expression === "sad" ? 7 : 20,
      10,
      16,
    );
  }
  c.stroke();
  if (r.accessory === "glasses") {
    c.beginPath();
    c.arc(-13, -1, 11, 0, Math.PI * 2);
    c.moveTo(24, -1);
    c.arc(13, -1, 11, 0, Math.PI * 2);
    c.moveTo(-2, -1);
    c.lineTo(2, -1);
    c.stroke();
  }
  if (r.accessory === "hat") {
    shape(0, -35, 76, 10, r.shirt, 3);
    shape(0, -51, 48, 27, r.shirt, 5);
  }
  c.restore();
  c.restore();
}

// Reusable declarative components compile to ordinary editable scene elements.
export function expandKits(scene) {
  if (!scene?.kits) return scene;
  if (!Array.isArray(scene.kits) || scene.kits.length > 12)
    throw Error("Use at most 12 scene components");
  const elements = [...(scene.elements || [])];
  for (const kit of scene.kits) {
    if (!kit.id || !/^[\w-]+$/.test(kit.id))
      throw Error(
        "Component IDs must contain letters, numbers, underscores or hyphens",
      );
    const scale = kit.scale ?? 1,
      x = kit.x ?? 0,
      y = kit.y ?? 0,
      z = kit.z ?? 0;
    if (![scale, x, y, z].every(Number.isFinite) || scale <= 0 || scale > 10)
      throw Error("Invalid component position or scale");
    const ink = kit.outline || "#203b42",
      color = kit.color || "#86b8ac",
      skin = kit.skin || "#dba87f";
    const add = (id, type, px, py, props = {}) =>
      elements.push({
        id: `${kit.id}-${id}`,
        type,
        x: x + px * scale,
        y: y + py * scale,
        fill: color,
        ...props,
        ...(props.width != null ? { width: props.width * scale } : {}),
        ...(props.height != null ? { height: props.height * scale } : {}),
        ...(props.radius != null ? { radius: props.radius * scale } : {}),
        delay: kit.delay || 0,
      });
    const rect = (id, px, py, width, height, fill, extra = {}) =>
      add(id, "rect", px, py, { width, height, fill, ...extra });
    const circle = (id, px, py, radius, fill, extra = {}) =>
      add(id, kit.style === "pixel" ? "rect" : "circle", px, py, {
        radius,
        width: radius * 2,
        height: radius * 2,
        fill,
        ...extra,
      });
    if (kit.type === "character") {
      const limb = (phase) => (kit.walk ? { animation: "walk", phase } : {});
      rect("leg-left", -15, 63, 18, 65, ink, limb(0));
      rect("leg-right", 15, 63, 18, 65, ink, limb(Math.PI));
      rect("arm-left", -36, 9, 14, 62, skin, limb(Math.PI));
      rect("arm-right", 36, 9, 14, 62, skin, limb(0));
      rect("body", 0, 9, 56, 70, color);
      circle("head", 0, -56, 31, skin);
      rect("hair", 0, -81, 48, 13, kit.hair || ink);
      circle("eye-left", -11, -57, 3, ink);
      circle("eye-right", 11, -57, 3, ink);
      rect(
        "mouth",
        0,
        -40,
        kit.expression === "surprised" ? 8 : 15,
        kit.expression === "surprised" ? 10 : 3,
        ink,
      );
    } else if (kit.type === "tree") {
      rect("trunk", 0, 40, 22, 105, "#846446");
      circle("crown-left", -25, -25, 43, color);
      circle("crown-right", 27, -20, 39, color);
      circle("crown-top", 0, -61, 40, color);
    } else if (kit.type === "building") {
      rect("wall", 0, 0, 150, 180, color);
      rect("roof", 0, -96, 166, 17, ink);
      rect("door", 0, 65, 30, 50, ink);
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 3; col++)
          rect(
            `window-${row}-${col}`,
            -45 + col * 45,
            -55 + row * 45,
            24,
            26,
            "#e9d8a4",
          );
    } else if (kit.type === "arrow") {
      rect("shaft", -12, 0, 96, 16, color);
      add("tip", "path", 36, 0, {
        path: `M${-16 * scale} ${-28 * scale} L${22 * scale} 0 L${-16 * scale} ${28 * scale} Z`,
        fill: color,
      });
    } else if (["ship", "bridge"].includes(kit.type)) {
      const box = (id, px, py, pz, w, h, d, fill) =>
        elements.push({
          id: `${kit.id}-${id}`,
          type: "box",
          x: x + px * scale,
          y: y + py * scale,
          z: z + pz * scale,
          width: w * scale,
          height: h * scale,
          depth: d * scale,
          fill,
        });
      if (kit.type === "ship") {
        box("hull", 0, 0.5, 0, 8, 1, 2.5, kit.color || "#385368");
        box("bridge", -2.6, 1.9, 0, 1.4, 1.8, 2, "#d8ddd8");
        for (let i = 0; i < 3; i++)
          for (let row = 0; row < 2; row++)
            box(
              `container-${i}-${row}`,
              -0.5 + i * 1.35,
              1.35 + row * 0.65,
              0,
              1.2,
              0.6,
              2.1,
              ["#b17d61", "#9ba97b", "#8499a7"][i],
            );
      } else {
        box("deck", 0, 3, 0, 12, 0.35, 2, color);
        for (const side of [-1, 1]) {
          box(`pier-${side}`, side * 4, 1.4, 0, 0.65, 2.8, 1.8, "#a7aaa2");
          box(`rail-${side}`, 0, 3.7, side * 0.9, 12, 0.15, 0.12, ink);
          for (let i = 0; i < 7; i++)
            box(
              `post-${side}-${i}`,
              -5.5 + i * 1.8,
              3.4,
              side * 0.9,
              0.1,
              0.6,
              0.1,
              ink,
            );
        }
      }
    } else throw Error(`Unknown scene component: ${kit.type}`);
  }
  return { ...scene, elements };
}
export const kitGuide = `Optional reusable components: kits:[{id,type,x,y,z,scale,color,style,walk,expression}]. Types character (face, body, articulated limbs; walk:true), tree, building, arrow use pixel coordinates; ship and bridge use world units. Components expand to editable elements named id-part. Character/tree/building are roughly 200 pixels high at scale1; ship is 8 world units long. style:'pixel' uses square component shapes. Use components where they fit the actual subject, with scene-specific props; never substitute them for accurate specialist objects. Animation can use keyframes:[{time,x,y,z,rotation,scale,opacity}] with strictly increasing shot-relative seconds and linear interpolation. cameraRig:{type:'orbit'|'dolly',target:{x,y,z},radius,height,speed,to:{x,y,z},duration} and lighting:{ambient,key,position:{x,y,z}} are available for 3D. Mark essential:true on key subjects to check screen visibility, grounded:true only on objects that should contact ground y=0, and collisionGroup on independently moving objects that must not intersect. Omit collisionGroup for deliberately assembled parts.`;

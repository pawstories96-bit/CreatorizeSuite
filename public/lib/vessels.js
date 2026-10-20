import * as THREE from "/vendor/three.module.js";

// A generic authored assembly, not a CAD model of a named historical vessel.
export function createContainerVessel(e) {
  const root = new THREE.Group(),
    beam = e.width,
    length = e.depth,
    height = e.height;
  const options = e.vessel || {},
    freeboard = height * 0.18,
    draft = Math.min(height * 0.26, beam * 0.28);
  const steel = new THREE.MeshStandardMaterial({
      color: options.hullColor || "#273c50",
      roughness: 0.7,
      metalness: 0.25,
    }),
    deck = new THREE.MeshStandardMaterial({ color: "#727971", roughness: 0.9 }),
    house = new THREE.MeshStandardMaterial({
      color: "#dddcd3",
      roughness: 0.85,
    }),
    trim = new THREE.MeshStandardMaterial({ color: "#4c5860", roughness: 0.7 }),
    glass = new THREE.MeshStandardMaterial({
      color: "#38505a",
      roughness: 0.3,
      metalness: 0.2,
    }),
    safety = new THREE.MeshStandardMaterial({
      color: "#bf6d38",
      roughness: 0.8,
    });
  const add = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z) =>
    add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const stations = [
      [-0.5, 0.015],
      [-0.475, 0.24],
      [-0.42, 0.72],
      [-0.3, 1],
      [0.28, 1],
      [0.43, 0.92],
      [0.5, 0.78],
    ],
    positions = [];
  const ring = ([z, f]) => [
    [(-beam * f) / 2, freeboard, z * length],
    [(beam * f) / 2, freeboard, z * length],
    [beam * f * 0.48, 0, z * length],
    [beam * f * 0.32, -draft, z * length],
    [0, -draft - 0.3, z * length],
    [-beam * f * 0.32, -draft, z * length],
    [-beam * f * 0.48, 0, z * length],
  ];
  const rings = stations.map(ring),
    triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < 7; j++) {
      const k = (j + 1) % 7;
      triangle(rings[i][j], rings[i + 1][j], rings[i][k]);
      triangle(rings[i][k], rings[i + 1][j], rings[i + 1][k]);
    }
  for (const [index, reverse] of [
    [0, true],
    [rings.length - 1, false],
  ])
    for (let j = 1; j < 6; j++) {
      const r = rings[index];
      reverse ? triangle(r[0], r[j + 1], r[j]) : triangle(r[0], r[j], r[j + 1]);
    }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  hull.computeVertexNormals();
  // Double-sided avoids open seams when a close cutaway crosses a bulkhead.
  steel.side = THREE.DoubleSide;
  add(hull, steel, 0, 0, 0);
  const deckShape = new THREE.Shape();
  stations.forEach(([z, f], i) =>
    i
      ? deckShape.lineTo((-beam * f) / 2, -z * length)
      : deckShape.moveTo((-beam * f) / 2, -z * length),
  );
  [...stations]
    .reverse()
    .forEach(([z, f]) => deckShape.lineTo((beam * f) / 2, -z * length));
  deckShape.closePath();
  const deckMesh = add(
    new THREE.ShapeGeometry(deckShape),
    deck,
    0,
    freeboard + 0.08,
    0,
  );
  deckMesh.rotation.x = -Math.PI / 2;
  // ISO-like modular cargo geometry uses one GPU draw with per-instance color.
  const cw = 2.44,
    ch = 2.59,
    cl = 12.19,
    columns = Math.max(2, Math.floor((beam - 6) / 2.65)),
    rows = Math.max(2, Math.floor((length * 0.57) / (cl + 0.4))),
    levels = options.cargoLevels || 5;
  const cells = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const stack = Math.max(
        1,
        levels - ((row * 7 + col * 3 + (e.seed || 1)) % 3),
      );
      for (let level = 0; level < stack; level++)
        cells.push({
          x: (col - (columns - 1) / 2) * 2.65,
          y: freeboard + 0.6 + ch * (level + 0.5),
          z: -length * 0.34 + (row + 0.5) * (cl + 0.4),
          palette: (row * 3 + col * 7 + level) % 5,
        });
    }
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#dddcd8";
  ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    ctx.fillStyle = "#b5b6b3";
    ctx.fillRect(x, 3, 2, 122);
    ctx.fillStyle = "#f0efea";
    ctx.fillRect(x + 2, 3, 1, 122);
  }
  ctx.strokeStyle = "#8f9494";
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, 126, 126);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const cargoMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: texture,
      roughness: 0.9,
      metalness: 0.1,
    }),
    cargo = new THREE.InstancedMesh(
      new THREE.BoxGeometry(cw, ch, cl),
      cargoMaterial,
      cells.length,
    ),
    dummy = new THREE.Object3D(),
    palette = ["#6b7b71", "#7e6a56", "#586e82", "#94876e", "#7d4d3f"];
  cargoMaterial.userData.ownedTextures = [texture];
  cells.forEach((cell, i) => {
    dummy.position.set(cell.x, cell.y, cell.z);
    dummy.updateMatrix();
    cargo.setMatrixAt(i, dummy.matrix);
    cargo.setColorAt(i, new THREE.Color(palette[cell.palette]));
  });
  cargo.castShadow = cargo.receiveShadow = true;
  cargo.userData.part = "container-stacks";
  root.add(cargo);
  // Aft accommodation, bridge wings, funnel, lifesaving gear and deck fittings.
  const aft = length * 0.335,
    base = freeboard + 0.4,
    houseHeight = height * 0.43,
    houseDepth = length * 0.08;
  box(
    beam * 0.64,
    houseHeight,
    houseDepth,
    house,
    0,
    base + houseHeight / 2,
    aft,
  );
  box(
    beam * 0.86,
    2.7,
    houseDepth * 1.2,
    house,
    0,
    base + houseHeight + 1.35,
    aft - 0.8,
  );
  box(
    beam * 0.89,
    0.5,
    houseDepth * 1.25,
    trim,
    0,
    base + houseHeight + 2.95,
    aft - 0.8,
  );
  for (let floor = 1; floor < Math.max(2, Math.floor(houseHeight / 3)); floor++)
    for (let side of [-1, 1])
      for (let window = 0; window < 5; window++)
        box(
          0.15,
          1.1,
          1.2,
          glass,
          side * (beam * 0.32 + 0.08),
          base + floor * 3,
          aft - houseDepth * 0.36 + window * houseDepth * 0.18,
        );
  for (
    let window = 0;
    window < Math.max(4, Math.floor((beam * 0.8) / 2.5));
    window++
  )
    box(
      1.8,
      1.55,
      0.18,
      glass,
      (window - (Math.floor((beam * 0.8) / 2.5) - 1) / 2) * 2.5,
      base + houseHeight + 1.35,
      aft - houseDepth * 0.6 - 1,
    );
  box(
    beam * 0.22,
    height * 0.25,
    length * 0.035,
    steel,
    0,
    base + height * 0.125,
    length * 0.445,
  );
  box(
    beam * 0.235,
    0.65,
    length * 0.04,
    trim,
    0,
    base + height * 0.25 + 0.3,
    length * 0.445,
  );
  for (const side of [-1, 1]) {
    const boat = add(
      new THREE.CapsuleGeometry(1.3, 6.4, 5, 12),
      safety,
      side * beam * 0.37,
      base + 7,
      aft + houseDepth * 0.14,
    );
    boat.rotation.x = Math.PI / 2;
    box(
      0.3,
      8,
      0.3,
      house,
      side * beam * 0.4,
      base + 5,
      aft + houseDepth * 0.14,
    );
    const railPoints = stations
      .slice(1, -1)
      .map(
        ([z, f]) =>
          new THREE.Vector3(
            side * beam * f * 0.49,
            freeboard + 1.25,
            z * length,
          ),
      );
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(railPoints),
        60,
        0.1,
        5,
        false,
      ),
      house,
      0,
      0,
      0,
    );
    for (let i = 0; i < 10; i++)
      add(
        new THREE.CylinderGeometry(0.09, 0.09, 1.25, 5),
        house,
        side * beam * 0.49,
        freeboard + 0.65,
        (-0.28 + i * 0.058) * length,
      );
  }
  const mastY = base + houseHeight + 5.5;
  add(new THREE.CylinderGeometry(0.2, 0.26, 6, 8), house, 0, mastY, aft);
  box(8, 0.2, 0.25, house, 0, mastY + 1.5, aft);
  for (const z of [-length * 0.43, length * 0.47])
    for (const side of [-1, 1]) {
      add(
        new THREE.CylinderGeometry(0.6, 0.7, 0.8, 10),
        trim,
        side * beam * 0.19,
        freeboard + 0.5,
        z,
      );
      box(3, 0.2, 1, trim, side * beam * 0.19, freeboard + 1, z);
    }
  root.userData.assetKind = "procedural-container-vessel";
  return root;
}

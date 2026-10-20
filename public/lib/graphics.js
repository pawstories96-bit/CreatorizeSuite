import * as THREE from "/vendor/three.module.js";
import { Reflector } from "/three-addons/objects/Reflector.js";
import { EffectComposer } from "/three-addons/postprocessing/EffectComposer.js";
import { RenderPass } from "/three-addons/postprocessing/RenderPass.js";
import { SSAOPass } from "/three-addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "/three-addons/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "/three-addons/postprocessing/FilmPass.js";
import { OutlinePass } from "/three-addons/postprocessing/OutlinePass.js";
import { OutputPass } from "/three-addons/postprocessing/OutputPass.js";
import { createContainerVessel } from "./vessels.js";
import { createMannequin } from "./mannequins.js";
const rad = (value) => (value * Math.PI) / 180;
export const seeded = (seed, index) => {
  const n = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function createMaterial(e, project) {
  const settings = e.material || {};
  const color =
    e.role && e.role !== "neutral"
      ? { actor: "#ef4444", protagonist: "#3b82f6", bystander: "#67e8f9" }[
          e.role
        ]
      : e.fill;
  const m = new THREE.MeshPhysicalMaterial({
    color: color || "#E8EAED",
    roughness: settings.roughness ?? 0.85,
    metalness: settings.metalness || 0,
    flatShading: settings.flatShading || project.style === "lowpoly",
    wireframe: !!settings.wireframe,
    emissive: settings.emissive || "#000000",
    emissiveIntensity: settings.emissiveIntensity || 0,
    transmission: settings.transmission || 0,
    thickness: settings.thickness || 0.5,
    transparent: !!settings.fresnel,
    opacity: settings.fresnel ? 0.7 : 1,
  });
  m.userData.alpha = m.opacity;
  const ps1 = project.ps1 || project.look === "Retro PS1";
  m.customProgramCacheKey = () =>
    JSON.stringify({ ps1: !!ps1, fresnel: !!settings.fresnel });
  if (settings.fresnel || ps1 || e.highlight) {
    m.onBeforeCompile = (shader) => {
      if (settings.fresnel)
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <output_fragment>",
          "#include <output_fragment>",
        );
      if (ps1)
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\ngl_Position.xy = floor(gl_Position.xy / gl_Position.w * vec2(240.0, 320.0)) / vec2(240.0, 320.0) * gl_Position.w;",
        );
      if (settings.fresnel)
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          "#include <opaque_fragment>\nfloat edgeLight = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0); gl_FragColor.rgb += diffuse * edgeLight * 0.5;",
        );
    };
  }
  return m;
}
function building3d(e, project) {
  const root = new THREE.Group(),
    w = e.width,
    h = e.height,
    d = e.depth,
    settings = e.building || {};
  const wall = createMaterial(e, project),
    roof = new THREE.MeshStandardMaterial({
      color: settings.roofColor || "#515c65",
      roughness: 0.92,
    });
  const add = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0);
  add(new THREE.BoxGeometry(w + 0.18, 0.25, d + 0.18), roof, 0, 0.125, 0);
  add(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), roof, 0, h + 0.125, 0);
  const floors =
      settings.floors || Math.max(1, Math.min(12, Math.floor(h / 3.2))),
    windows = [];
  for (const [span, axis, side] of [
    [w, "z", -1],
    [w, "z", 1],
    [d, "x", -1],
    [d, "x", 1],
  ]) {
    const columns = Math.max(1, Math.min(20, Math.floor(span / 3)));
    for (let floor = 0; floor < floors; floor++)
      for (let column = 0; column < columns; column++) {
        const horizontal = ((column + 0.5) / columns) * span - span / 2,
          y = ((floor + 0.58) / floors) * h;
        if (
          floor === 0 &&
          axis === "z" &&
          side === 1 &&
          Math.abs(horizontal) < 1.8
        )
          continue;
        windows.push({
          x: axis === "x" ? side * (w / 2 + 0.025) : horizontal,
          y,
          z: axis === "z" ? side * (d / 2 + 0.025) : horizontal,
          rotation: axis === "x" ? Math.PI / 2 : 0,
        });
      }
  }
  const glass = new THREE.MeshStandardMaterial({
    color: settings.windowColor || "#526c7c",
    roughness: 0.28,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.55, 1.55, 0.08),
      roof,
      windows.length,
    ),
    panes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      glass,
      windows.length,
    ),
    dummy = new THREE.Object3D();
  windows.forEach((v, i) => {
    dummy.position.set(v.x, v.y, v.z);
    dummy.rotation.y = v.rotation;
    dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
    dummy.position[v.rotation ? "x" : "z"] +=
      (v.rotation ? Math.sign(v.x) : Math.sign(v.z)) * 0.05;
    dummy.updateMatrix();
    panes.setMatrixAt(i, dummy.matrix);
  });
  frames.castShadow = frames.receiveShadow = true;
  root.add(frames, panes);
  const doorWidth = Math.min(w * 0.3, settings.kind === "warehouse" ? 4 : 1.5),
    doorHeight = Math.min(h * 0.75, settings.kind === "warehouse" ? 3.5 : 2.3);
  add(
    new THREE.BoxGeometry(doorWidth, doorHeight, 0.12),
    roof,
    0,
    doorHeight / 2,
    d / 2 + 0.07,
  );
  if (settings.kind === "warehouse")
    for (let i = 1; i < 6; i++)
      add(
        new THREE.BoxGeometry(doorWidth, 0.035, 0.02),
        wall,
        0,
        (i / 6) * doorHeight,
        d / 2 + 0.14,
      );
  for (let i = 0; i < Math.min(4, Math.ceil(w / 8)); i++)
    add(
      new THREE.BoxGeometry(1.2, 0.65, 1.1),
      roof,
      -w * 0.3 + i * 2,
      h + 0.55,
      -d * 0.2,
    );
  if (settings.kind === "house") {
    const slope = Math.atan2(Math.min(w * 0.3, 3), w / 2 + 0.4),
      length = (w / 2 + 0.4) / Math.cos(slope);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(0, (Math.tan(slope) * w) / 2);
    shape.lineTo(w / 2, 0);
    shape.closePath();
    add(
      new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }),
      wall,
      0,
      h,
      -d / 2,
    );
    for (const side of [-1, 1]) {
      const panel = add(
        new THREE.BoxGeometry(length, 0.2, d + 0.8),
        roof,
        (side * w) / 4,
        h + (Math.sin(slope) * length) / 2,
        0,
      );
      panel.rotation.z = -side * slope;
    }
  }
  return root;
}
function particleSystem(e) {
  const material = new THREE.MeshStandardMaterial({
    color: e.fill,
    roughness: 0.9,
  });
  const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(e.radius, 0),
      material,
      e.particleCount,
    ),
    dummy = new THREE.Object3D();
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.animate = (t) => {
    const age = t - e.delay,
      life = e.duration;
    mesh.visible = age >= 0 && age < life;
    for (let i = 0; i < e.particleCount; i++) {
      const vx = (seeded(e.seed, i * 3) - 0.5) * e.speed,
        vy = seeded(e.seed, i * 3 + 1) * e.speed,
        vz = (seeded(e.seed, i * 3 + 2) - 0.5) * e.speed;
      dummy.position.set(
        vx * Math.max(0, age),
        vy * Math.max(0, age) - 0.5 * e.gravity * Math.max(0, age) ** 2,
        vz * Math.max(0, age),
      );
      dummy.rotation.set(age * (i % 5), age * (i % 7), age * (i % 3));
      dummy.scale.setScalar(Math.max(0.01, 1 - Math.max(0, age) / life));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  return mesh;
}
function evidenceBoard(e, project) {
  const root = new THREE.Group(),
    board = new THREE.Mesh(
      new THREE.BoxGeometry(e.width, e.height, e.depth),
      new THREE.MeshStandardMaterial({ color: "#4b3c2c", roughness: 1 }),
    );
  root.add(board);
  const pins = [];
  for (let i = 0; i < 6; i++) {
    const x = (seeded(e.seed, i) - 0.5) * e.width * 0.8,
      y = (seeded(e.seed, i + 12) - 0.5) * e.height * 0.75;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(e.width * 0.21, e.height * 0.3),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? "#d4c8b3" : "#a6afb0",
        side: THREE.DoubleSide,
      }),
    );
    card.position.set(x, y, e.depth / 2 + 0.03);
    card.rotation.z = (seeded(e.seed, i + 20) - 0.5) * 0.2;
    root.add(card);
    pins.push(new THREE.Vector3(x, y, e.depth / 2 + 0.06));
  }
  for (let i = 1; i < pins.length; i++) {
    const curve = new THREE.LineCurve3(pins[i - 1], pins[i]);
    root.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 1, 0.012, 5, false),
        new THREE.MeshStandardMaterial({ color: "#bd3030" }),
      ),
    );
  }
  return root;
}
export function createGeometryObject(e, project) {
  if (e.type === "vessel3d") return createContainerVessel(e);
  if (e.type === "building3d") return building3d(e, project);
  if (e.type === "mannequin")
    return createMannequin(e, project, createMaterial(e, project));
  if (e.type === "particles") return particleSystem(e);
  if (e.type === "evidence-board") return evidenceBoard(e, project);
  let geometry;
  if (e.type === "box")
    geometry = new THREE.BoxGeometry(e.width, e.height, e.depth);
  if (e.type === "sphere")
    geometry = new THREE.SphereGeometry(
      e.radius,
      project.style === "lowpoly" ? 10 : e.segments,
      project.style === "lowpoly" ? 8 : 16,
    );
  if (e.type === "cylinder")
    geometry = new THREE.CylinderGeometry(
      e.radius,
      e.radius,
      e.height,
      e.segments,
    );
  if (e.type === "cone")
    geometry = new THREE.ConeGeometry(e.radius, e.height, e.segments);
  if (e.type === "capsule")
    geometry = new THREE.CapsuleGeometry(
      e.radius,
      Math.max(0.01, e.height - e.radius * 2),
      6,
      e.segments,
    );
  if (e.type === "torus")
    geometry = new THREE.TorusGeometry(e.radius, e.tubeRadius, 12, e.segments);
  if (e.type === "tube") {
    const points = e.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      path = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++)
      path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    geometry = new THREE.TubeGeometry(
      e.curve === "smooth"
        ? new THREE.CatmullRomCurve3(points, false, "centripetal")
        : path,
      Math.min(200, e.points.length * 12),
      e.tubeRadius,
      10,
      false,
    );
  }
  if (e.type === "plane" || e.type === "water")
    geometry = new THREE.PlaneGeometry(e.width, e.height);
  if (e.type === "terrain") {
    geometry = new THREE.PlaneGeometry(
      e.width,
      e.depth,
      e.gridSize - 1,
      e.gridSize - 1,
    );
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setY(i, e.heightMap[i]);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  if (e.type === "extrusion") {
    const shape = new THREE.Shape();
    e.points.forEach((p, i) =>
      i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y),
    );
    shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: e.depth,
      bevelEnabled: false,
    });
  }
  if (!geometry) return null;
  if (e.type === "water") {
    const mirror = new Reflector(geometry, {
      color: e.fill || "#7e9da1",
      textureWidth: 768,
      textureHeight: 768,
      multisample: 0,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.userData.fixedRotationX = -Math.PI / 2;
    mirror.material.uniforms.creatorTime = { value: 0 };
    mirror.material.uniforms.creatorRoughness = {
      value: e.material?.roughness ?? 0.32,
    };
    const extent = Math.min(e.width, e.height);
    mirror.material.uniforms.creatorFogColor = {
      value: new THREE.Color(
        project.sceneFog?.color ||
          project.sceneEnvironment?.skyHorizon ||
          "#d6e1e5",
      ),
    };
    mirror.material.uniforms.creatorFogRange = {
      value: new THREE.Vector2(
        project.sceneFog?.near ?? extent * 0.24,
        project.sceneFog?.far ?? extent * 0.48,
      ),
    };
    mirror.material.uniforms.creatorFogEnabled = {
      value:
        project.sceneFog ||
        (project.sceneEnvironment?.kind === "exterior" && extent >= 500)
          ? 1
          : 0,
    };
    mirror.material.vertexShader = mirror.material.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 creatorWorld;",
      )
      .replace(
        "vUv = textureMatrix",
        "creatorWorld = (modelMatrix * vec4(position, 1.0)).xyz;\n vUv = textureMatrix",
      );
    mirror.material.fragmentShader = mirror.material.fragmentShader
      .replace(
        "void main()",
        `uniform float creatorTime;
uniform float creatorRoughness;
uniform vec3 creatorFogColor;
uniform vec2 creatorFogRange;
uniform float creatorFogEnabled;
varying vec3 creatorWorld;
void main()`,
      )
      .replace(
        "vec4 base = texture2DProj( tDiffuse, vUv );",
        `vec2 uv = vUv.xy / vUv.w;
float wave = sin(creatorWorld.x * .38 + creatorWorld.z * .21 + creatorTime * .7);
float crossWave = cos(creatorWorld.x * .15 - creatorWorld.z * .42 + creatorTime * .48);
uv += vec2(wave, crossWave) * .002;
vec2 blur = vec2(.0007 + creatorRoughness * .003);
vec4 base = texture2D(tDiffuse, uv) * .4
 + texture2D(tDiffuse, uv + vec2(blur.x, 0.0)) * .15
 + texture2D(tDiffuse, uv - vec2(blur.x, 0.0)) * .15
 + texture2D(tDiffuse, uv + vec2(0.0, blur.y)) * .15
 + texture2D(tDiffuse, uv - vec2(0.0, blur.y)) * .15;`,
      )
      .replace(
        "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
        `vec3 eye = normalize(cameraPosition - creatorWorld);
float fresnel = .18 + .55 * pow(1.0 - abs(eye.y), 3.0);
vec3 surface = color * (1.0 + (wave + crossWave) * .022);
vec3 waterColor = mix(surface, base.rgb, fresnel * (1.0 - creatorRoughness * .35));
float haze = smoothstep(creatorFogRange.x,creatorFogRange.y,length(cameraPosition-creatorWorld))*creatorFogEnabled;
gl_FragColor = vec4(mix(waterColor,creatorFogColor,haze), 1.0);`,
      );
    mirror.userData.animate = (t) =>
      (mirror.material.uniforms.creatorTime.value = t);
    return mirror;
  }
  return new THREE.Mesh(geometry, createMaterial(e, project));
}
export function createPostProcessing(
  renderer,
  world,
  camera,
  project,
  scene,
  width,
  height,
  meshes,
) {
  const effects = {
    ...(project.style === "3d" ? { ssao: true, outline: true } : {}),
    ...(project.look === "Retro PS1" ? { grain: 0.13 } : {}),
    ...scene.effects,
  };
  if (effects.fog)
    world.fog = new THREE.Fog(
      effects.fog.color,
      effects.fog.near,
      effects.fog.far,
    );
  if (!effects.ssao && !effects.bloom && !effects.grain && !effects.outline)
    return null;
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(world, camera));
  if (effects.ssao) {
    const pass = new SSAOPass(world, camera, width, height, 16);
    for (let i = 0; i < pass.kernel.length; i++)
      pass.kernel[i]
        .set(
          seeded(42, i * 3) * 2 - 1,
          seeded(42, i * 3 + 1) * 2 - 1,
          seeded(42, i * 3 + 2),
        )
        .normalize()
        .multiplyScalar(0.1 + 0.9 * (i / pass.kernel.length) ** 2);
    pass.noiseTexture.image.data.set(
      Float32Array.from({ length: 16 }, (_, i) => seeded(91, i) * 2 - 1),
    );
    pass.noiseTexture.needsUpdate = true;
    pass.kernelRadius = 3;
    pass.minDistance = 0.002;
    pass.maxDistance = 0.04;
    composer.addPass(pass);
  }
  if (effects.bloom)
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(width, height),
        effects.bloom,
        0.35,
        0.8,
      ),
    );
  let outline;
  if (effects.outline) {
    outline = new OutlinePass(new THREE.Vector2(width, height), world, camera);
    outline.visibleEdgeColor.set("#f7d34f");
    outline.hiddenEdgeColor.set("#a67c21");
    outline.edgeStrength = 4;
    outline.edgeThickness = 1.5;
    composer.addPass(outline);
  }
  const film = effects.grain ? new FilmPass(effects.grain, false) : null;
  if (film) composer.addPass(film);
  composer.addPass(new OutputPass());
  return {
    render(t, selected) {
      if (outline) {
        outline.selectedObjects = meshes
          .filter((v) => v.e.id === selected || v.e.highlight)
          .map((v) => v.m);
        outline.enabled = outline.selectedObjects.length > 0;
      }
      if (film) film.uniforms.time.value = t;
      composer.render(0);
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
    },
  };
}

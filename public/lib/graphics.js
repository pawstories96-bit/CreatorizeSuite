import * as THREE from "/vendor/three.module.js";
import { Reflector } from "/three-addons/objects/Reflector.js";
import { EffectComposer } from "/three-addons/postprocessing/EffectComposer.js";
import { RenderPass } from "/three-addons/postprocessing/RenderPass.js";
import { SSAOPass } from "/three-addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "/three-addons/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "/three-addons/postprocessing/FilmPass.js";
import { OutlinePass } from "/three-addons/postprocessing/OutlinePass.js";
import { OutputPass } from "/three-addons/postprocessing/OutputPass.js";
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
function actor(e, project) {
  const root = new THREE.Group(),
    h = e.height,
    s = h / 1.8;
  const mat = createMaterial(e, project),
    joints = {};
  const part = (name, geometry, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x * s, y * s, z * s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    mesh.userData.part = name;
    return mesh;
  };
  part(
    "torso",
    new THREE.CapsuleGeometry(0.19 * s, 0.35 * s, 4, 8),
    0,
    1.12,
    0,
  );
  part(
    "head",
    new THREE.SphereGeometry(
      0.145 * s,
      project.style === "lowpoly" ? 8 : 20,
      12,
    ),
    0,
    1.64,
    0,
  );
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11 * s, 0.85 * s, 0);
    root.add(leg);
    part(
      "leg",
      new THREE.CapsuleGeometry(0.075 * s, 0.62 * s, 4, 8),
      0,
      -0.4,
      0,
      leg,
    );
    joints[`leg${side}`] = leg;
    part(
      "foot",
      new THREE.BoxGeometry(0.15 * s, 0.13 * s, 0.26 * s),
      0,
      -0.785,
      0.045,
      leg,
    );
    const arm = new THREE.Group();
    arm.position.set(side * 0.27 * s, 1.38 * s, 0);
    root.add(arm);
    part(
      "arm",
      new THREE.CapsuleGeometry(0.06 * s, 0.47 * s, 4, 8),
      0,
      -0.28,
      0,
      arm,
    );
    joints[`arm${side}`] = arm;
  }
  if (project.style === "lowpoly") {
    const face = new THREE.MeshBasicMaterial({ color: "#17202b" });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.016 * s, 6, 6),
        face,
      );
      eye.position.set(side * 0.05 * s, 1.66 * s, 0.135 * s);
      root.add(eye);
    }
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.065 * s,
        (e.expression === "surprised" ? 0.05 : 0.014) * s,
        0.012 * s,
      ),
      face,
    );
    mouth.position.set(0, 1.58 * s, 0.14 * s);
    root.add(mouth);
  }
  root.userData.animate = (t) => {
    const gait = ["walk", "run"].includes(e.pose)
      ? Math.sin(t * (e.pose === "run" ? 10 : 5)) *
        (e.pose === "run" ? 0.8 : 0.5)
      : Math.sin(t * 1.8) * 0.018;
    joints.leg1.rotation.x = gait;
    joints["leg-1"].rotation.x = -gait;
    joints.arm1.rotation.x = -gait * 0.7;
    joints["arm-1"].rotation.x = gait * 0.7;
    if (e.pose === "point") joints.arm1.rotation.z = -1.25;
    if (e.pose === "sit") {
      joints.leg1.rotation.x = -Math.PI / 2;
      joints["leg-1"].rotation.x = -Math.PI / 2;
    }
    if (e.pose === "fall") root.rotation.z = Math.min(Math.PI / 2, t * 0.8);
  };
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
  if (e.type === "mannequin") return actor(e, project);
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
  if (e.type === "tube")
    geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        e.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
        false,
        "centripetal",
      ),
      Math.min(200, e.points.length * 12),
      e.tubeRadius,
      10,
      false,
    );
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
    mirror.material.fragmentShader = mirror.material.fragmentShader
      .replace("void main()", "uniform float creatorTime;\nvoid main()")
      .replace(
        "texture2DProj( tDiffuse, vUv )",
        "texture2DProj( tDiffuse, vUv + vec4(sin(vUv.y * 90.0 + creatorTime) * 0.0015, cos(vUv.x * 75.0 + creatorTime) * 0.001, 0.0, 0.0) )",
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

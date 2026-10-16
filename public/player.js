import * as THREE from "/vendor/three.module.js";
import { GLTFLoader } from "/three-addons/loaders/GLTFLoader.js";
import { clone } from "/three-addons/utils/SkeletonUtils.js";
import {
  geometryTypes,
  createGeometryObject,
  createPostProcessing,
  drawCharacter2d,
} from "/engine.js";
const models = new Map(),
  videos = new Map();
const canvas = document.querySelector("#stage"),
  c = canvas.getContext("2d"),
  threeCanvas = document.querySelector("#three");
let renderer,
  postProcessing,
  world,
  camera,
  meshes = [],
  project = null,
  shot = null,
  images = new Map(),
  selected = null,
  currentTime = 0,
  metrics = [],
  logicalWidth = 1280,
  logicalHeight = 720;
const params = new URLSearchParams(location.search);
let width = Number(params.get("width")) || 1280,
  height = Number(params.get("height")) || 720;
canvas.width = width;
canvas.height = height;
function ease(x) {
  x = Math.max(0, Math.min(1, x));
  return 1 - (1 - x) ** 3;
}
function transform(e, t) {
  const cue = project?.timeline?.cues?.find(
    (cue) => cue.shotId === shot?.id && cue.elementId === e.id,
  );
  if (cue) {
    e = { ...e, delay: cue.time - shot.start };
    if (t < e.delay)
      return {
        x: e.x,
        y: e.y,
        z: e.z,
        scale: 1,
        rotation: e.rotation,
        opacity: 0,
      };
  }
  let p = ease((t - e.delay) / e.duration),
    x = e.x,
    y = e.y,
    z = e.z || 0,
    scale = 1,
    rotation = e.rotation,
    opacity = e.opacity;
  if (e.animation === "fade") opacity *= p;
  if (e.animation === "slide") {
    opacity *= p;
    x -= 80 * (1 - p);
  }
  if (e.animation === "float") y += Math.sin(t * 1.5 + e.x * 0.01) * 8;
  if (e.animation === "pulse") scale = 1 + Math.sin(t * 2) * 0.04;
  if (e.animation === "rotate") rotation += t * 15;
  if (e.animation === "walk") rotation += Math.sin(t * 5 + (e.phase || 0)) * 20;
  const result = { x, y, z, scale, rotation, opacity };
  for (const key of Object.keys(result)) {
    const frames = (e.keyframes || []).filter((k) => k[key] != null);
    if (!frames.length) continue;
    let previous = { time: 0, [key]: result[key] };
    for (const frame of frames) {
      if (t < frame.time) {
        const ratio = Math.max(
          0,
          (t - previous.time) / (frame.time - previous.time),
        );
        result[key] = previous[key] + (frame[key] - previous[key]) * ratio;
        break;
      }
      previous = frame;
      result[key] = frame[key];
    }
  }
  return result;
}
function lines(text, size, maxWidth) {
  c.font = `${project.style === "collage" ? "bold" : "600"} ${size}px ${project.style === "collage" ? "Georgia" : "Arial"}`;
  let result = [],
    line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (c.measureText(next).width > maxWidth && line) {
      result.push(line);
      line = word;
    } else line = next;
  }
  if (line) result.push(line);
  return result;
}
function draw(e, t) {
  if (e.anchor3d && camera) {
    const target = new THREE.Vector3(
      e.anchor3d.x,
      e.anchor3d.y,
      e.anchor3d.z,
    ).project(camera);
    if (target.z < -1 || target.z > 1) return;
    const ax = ((target.x + 1) * logicalWidth) / 2,
      ay = ((1 - target.y) * logicalHeight) / 2;
    const x = e.x || ax + 100,
      y = e.y || ay - 70;
    c.save();
    c.strokeStyle = e.stroke || "#4c5d64";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(x, y);
    c.stroke();
    c.fillStyle = c.strokeStyle;
    c.beginPath();
    c.arc(ax, ay, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    e = { ...e, x, y };
  }
  const a = transform(e, t);
  let metric = {
    id: e.id,
    type: e.type,
    essential: e.essential,
    visible: a.opacity > 0.01,
  };
  let boxWidth = e.type === "circle" ? e.radius * 2 : e.width;
  let boxHeight = e.type === "circle" ? e.radius * 2 : e.height;
  c.save();
  c.translate(a.x, a.y);
  c.rotate((a.rotation * Math.PI) / 180);
  c.scale(a.scale, a.scale);
  c.globalAlpha = a.opacity;
  c.fillStyle = e.fill;
  c.strokeStyle = e.stroke || e.fill;
  c.lineWidth = e.strokeWidth;
  if (e.type === "character2d") {
    drawCharacter2d(c, e, t, project.style);
  } else if (e.type === "rect") {
    c.beginPath();
    c.roundRect(
      -e.width / 2,
      -e.height / 2,
      e.width,
      e.height,
      project.style === "pixel" ? 0 : Math.min(16, e.height * 0.1),
    );
    c.fill();
    if (e.stroke) c.stroke();
  } else if (e.type === "circle") {
    c.beginPath();
    c.arc(0, 0, e.radius, 0, Math.PI * 2);
    c.fill();
    if (e.stroke) c.stroke();
  } else if (e.type === "line") {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(e.width, e.height);
    c.stroke();
  } else if (e.type === "path") {
    const p = new Path2D(e.path);
    if (e.fill && e.fill !== "none") c.fill(p);
    if (e.stroke) c.stroke(p);
  } else if (e.type === "image" || e.type === "video") {
    const img = e.type === "video" ? videos.get(e.src) : images.get(e.src);
    if (img) c.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height);
  } else if (e.type === "text") {
    let size = e.fontSize,
      ls = lines(e.text, size, e.width);
    while (
      (ls.length * size * 1.2 > e.height ||
        ls.some((line) => c.measureText(line).width > e.width)) &&
      size > 16
    ) {
      size--;
      ls = lines(e.text, size, e.width);
    }
    c.font = `${project.style === "collage" ? "bold" : "600"} ${size}px ${project.style === "collage" ? "Georgia" : "Arial"}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    ls.forEach((l, i) =>
      c.fillText(l, 0, (i - (ls.length - 1) / 2) * size * 1.2),
    );
    boxWidth = Math.max(0, ...ls.map((line) => c.measureText(line).width));
    boxHeight = ls.length * size * 1.2;
    metric = {
      ...metric,
      fontSize: size,
      overflow: boxHeight > e.height || boxWidth > e.width,
    };
  }
  if (
    [
      "rect",
      "circle",
      "text",
      "image",
      "video",
      "line",
      "character2d",
    ].includes(e.type)
  ) {
    const angle = (a.rotation * Math.PI) / 180;
    const corners =
      e.type === "line"
        ? [
            [0, 0],
            [e.width, e.height],
          ]
        : [
            [-boxWidth / 2, -boxHeight / 2],
            [boxWidth / 2, -boxHeight / 2],
            [boxWidth / 2, boxHeight / 2],
            [-boxWidth / 2, boxHeight / 2],
          ];
    const points = corners.map(([x, y]) => ({
      x: a.x + a.scale * (x * Math.cos(angle) - y * Math.sin(angle)),
      y: a.y + a.scale * (x * Math.sin(angle) + y * Math.cos(angle)),
    }));
    const bounds = {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    };
    const offscreen =
      bounds.left < 0 ||
      bounds.right > logicalWidth ||
      bounds.top < 0 ||
      bounds.bottom > logicalHeight;
    metrics.push({
      ...metric,
      bounds,
      offscreen,
      overflow:
        e.type === "text" && metric.visible && (metric.overflow || offscreen),
    });
  }
  if (selected === e.id) {
    c.strokeStyle = "#b9e0ca";
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    c.strokeRect(
      -e.width / 2 - 5,
      -e.height / 2 - 5,
      e.width + 10,
      e.height + 10,
    );
  }
  c.restore();
}
function build3d(s) {
  postProcessing?.dispose();
  postProcessing = null;
  meshes = [];
  threeCanvas.style.display = "none";
  if (!s?.scene?.elements.some((e) => geometryTypes.includes(e.type))) return;
  threeCanvas.style.display = "block";
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
  }
  if (world)
    world.traverse((o) => {
      if (o.isReflector) o.dispose();
      o.shadow?.dispose?.();
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    });
  world = new THREE.Scene();
  const cp = s.scene.camera || { x: 12, y: 10, z: 18 };
  camera = new THREE.PerspectiveCamera(
    40,
    width / height,
    0.1,
    Math.max(500, Math.hypot(cp.x, cp.y, cp.z) * 8),
  );
  camera.position.set(cp.x, cp.y, cp.z);
  camera.lookAt(0, 1, 0);
  const lighting = s.scene.lighting;
  world.add(
    new THREE.HemisphereLight(0xe6f0ff, 0x4b5260, lighting?.ambient ?? 2),
  );
  const light = new THREE.DirectionalLight(0xffffff, lighting?.key ?? 3);
  const lp = lighting?.position || { x: 8, y: 16, z: 10 };
  light.position.set(lp.x, lp.y, lp.z);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {
    left: -20,
    right: 20,
    top: 20,
    bottom: -20,
    near: 0.1,
    far: 100,
  });
  light.shadow.normalBias = 0.03;
  world.add(light);
  meshes = [];
  for (const e of s.scene.elements) {
    if (e.type === "model") {
      const asset = models.get(e.src);
      if (!asset) continue;
      const m = clone(asset.scene);
      m.traverse((o) => {
        o.userData.id = e.id;
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
        if (o.material)
          o.material = Array.isArray(o.material)
            ? o.material.map((m) => m.clone())
            : o.material.clone();
        if (o.geometry) o.geometry = o.geometry.clone();
      });
      const mixer = new THREE.AnimationMixer(m);
      asset.animations.forEach((clip) => mixer.clipAction(clip).play());
      world.add(m);
      meshes.push({ m, e, mixer });
      continue;
    }
    const m = createGeometryObject(e, {
      ...project,
      ps1: s.scene.effects?.ps1,
    });
    if (!m) continue;
    m.position.set(e.x, e.y, e.z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.id = e.id;
    m.traverse((o) => {
      o.userData.id = e.id;
    });
    world.add(m);
    meshes.push({ m, e });
  }
  postProcessing = createPostProcessing(
    renderer,
    world,
    camera,
    project,
    s.scene,
    width,
    height,
    meshes,
  );
}
function measure3d() {
  world.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const boxes = [],
    ray = new THREE.Raycaster();
  for (const { m, e } of meshes) {
    if (
      !m.visible ||
      (Array.isArray(m.material)
        ? m.material[0]?.opacity
        : m.material?.opacity) === 0
    )
      continue;
    const box = new THREE.Box3().setFromObject(m);
    if (box.isEmpty()) continue;
    const points = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          points.push(new THREE.Vector3(x, y, z).project(camera));
    const bounds = {
      left: Math.min(...points.map((p) => ((p.x + 1) * logicalWidth) / 2)),
      right: Math.max(...points.map((p) => ((p.x + 1) * logicalWidth) / 2)),
      top: Math.min(...points.map((p) => ((1 - p.y) * logicalHeight) / 2)),
      bottom: Math.max(...points.map((p) => ((1 - p.y) * logicalHeight) / 2)),
    };
    const offscreen =
      bounds.left < 0 ||
      bounds.right > logicalWidth ||
      bounds.top < 0 ||
      bounds.bottom > logicalHeight ||
      points.every((p) => p.z < -1 || p.z > 1);
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const samples = [center];
    for (const axis of ["x", "y", "z"])
      for (const side of [-1, 1]) {
        const point = center.clone();
        point[axis] += size[axis] * 0.4 * side;
        samples.push(point);
      }
    let seen = 0;
    for (const point of samples) {
      const projected = point.clone().project(camera);
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
      const hit = ray
        .intersectObjects(
          meshes.filter((v) => v.m.visible).map((v) => v.m),
          true,
        )
        .find(
          (h) => h.object.visible && (h.object.material?.opacity ?? 1) > 0.01,
        );
      if (hit?.object.userData.id === e.id) seen++;
    }
    const problems = [];
    if (e.essential && offscreen)
      problems.push("essential subject leaves the frame");
    if (e.essential && seen === 0)
      problems.push("essential subject is fully occluded in raycast samples");
    if (e.grounded && box.min.y > 0.05)
      problems.push("grounded object floats above y=0");
    if (e.grounded && box.min.y < -0.05)
      problems.push("grounded object penetrates ground y=0");
    const metric = {
      id: e.id,
      type: e.type,
      visible: true,
      essential: e.essential,
      bounds,
      offscreen,
      visibleSamples: seen,
      raycastSamples: samples.length,
      worldBounds: { min: box.min.toArray(), max: box.max.toArray() },
      problems,
    };
    metrics.push(metric);
    boxes.push({ box, e, metric });
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      if (!a.e.collisionGroup || a.e.collisionGroup !== b.e.collisionGroup)
        continue;
      const overlap = a.box
        .clone()
        .intersect(b.box)
        .getSize(new THREE.Vector3());
      if (Math.min(overlap.x, overlap.y, overlap.z) > 0.02) {
        a.metric.problems.push(`bounding volume intersects ${b.e.id}`);
        b.metric.problems.push(`bounding volume intersects ${a.e.id}`);
      }
    }
}
function render(t) {
  currentTime = t;
  if (!project) return;
  const s =
    project.shots.find((s) => t >= s.start && t < s.end) ||
    project.shots.at(-1);
  if (s?.id !== shot?.id || s?.scene !== shot?.scene) {
    shot = s;
    build3d(s);
  }
  metrics = [];
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.scale(canvas.width / logicalWidth, canvas.height / logicalHeight);
  c.fillStyle = s?.scene?.background || "#121818";
  c.fillRect(0, 0, logicalWidth, logicalHeight);
  const cameraVideo = project.sourceVideo && videos.get(project.sourceVideo);
  if (cameraVideo?.readyState >= 2) {
    const scale = Math.max(
      logicalWidth / cameraVideo.videoWidth,
      logicalHeight / cameraVideo.videoHeight,
    );
    c.drawImage(
      cameraVideo,
      (logicalWidth - cameraVideo.videoWidth * scale) / 2,
      (logicalHeight - cameraVideo.videoHeight * scale) / 2,
      cameraVideo.videoWidth * scale,
      cameraVideo.videoHeight * scale,
    );
  }
  if (s?.scene) {
    const local = Math.max(0, t - s.start);
    for (const { m, e, mixer } of meshes) {
      const a = transform(e, local);
      m.visible = a.opacity > 0.01;
      m.position.set(a.x, a.y, a.z);
      m.rotation.set(
        ((e.rotation3d?.x || 0) * Math.PI) / 180 +
          (m.userData.fixedRotationX || 0),
        ((a.rotation + (e.rotation3d?.y || 0)) * Math.PI) / 180,
        ((e.rotation3d?.z || 0) * Math.PI) / 180,
      );
      m.scale.setScalar(a.scale * (e.scale || 1));
      mixer?.setTime(local);
      m.userData.animate?.(local);
      m.traverse((o) => {
        for (const material of Array.isArray(o.material)
          ? o.material
          : o.material
            ? [o.material]
            : []) {
          if (o.isReflector) continue;
          material.opacity = a.opacity * (material.userData.alpha ?? 1);
          material.transparent =
            material.opacity < 1 || !!material.transmission;
        }
      });
    }
    if (renderer && threeCanvas.style.display !== "none") {
      const rig = s.scene.cameraRig;
      if (rig) {
        const target = new THREE.Vector3(
          rig.target.x,
          rig.target.y,
          rig.target.z,
        );
        if (rig.type === "orbit")
          camera.position.set(
            target.x + Math.sin(local * rig.speed) * rig.radius,
            target.y + rig.height,
            target.z + Math.cos(local * rig.speed) * rig.radius,
          );
        else {
          const from = s.scene.camera || { x: 12, y: 10, z: 18 },
            to = rig.to || from;
          camera.position.lerpVectors(
            new THREE.Vector3(from.x, from.y, from.z),
            new THREE.Vector3(to.x, to.y, to.z),
            Math.min(1, local / rig.duration),
          );
        }
        camera.lookAt(target);
      }
      if (postProcessing) postProcessing.render(local, selected);
      else renderer.render(world, camera);
      c.drawImage(threeCanvas, 0, 0, logicalWidth, logicalHeight);
      if (params.has("inspect")) measure3d();
    }
    for (const e of s.scene.elements)
      if (!geometryTypes.includes(e.type)) draw(e, local);
    if (s.scene.label || project.style === "3d") {
      c.fillStyle = "rgba(0,0,0,.6)";
      c.fillRect(logicalWidth - 270, 24, 246, 34);
      c.fillStyle = "#fff";
      c.font = "13px monospace";
      c.textAlign = "center";
      c.fillText(s.scene.label || "RECONSTRUCTION", logicalWidth - 147, 46);
    }
  } else if (!cameraVideo) {
    c.fillStyle = "#74847e";
    c.font = "22px Arial";
    c.textAlign = "center";
    c.fillText(
      s ? "This shot is waiting to be built" : "Your story starts here",
      640,
      350,
    );
    c.font = "15px Arial";
    c.fillStyle = "#52645b";
    c.fillText(
      s
        ? "Completed shots remain available while the build continues."
        : "Add a script and voiceover, then build your video.",
      640,
      384,
    );
  }
  for (const card of project.timeline?.cards || [])
    if (t >= card.start && t < card.end) {
      draw(
        {
          ...card,
          type: "rect",
          fill: card.background,
          opacity: 1,
          rotation: 0,
          animation: "none",
          delay: 0,
          duration: 1,
          strokeWidth: 0,
        },
        0,
      );
      draw(
        {
          ...card,
          id: card.id + "-text",
          type: "text",
          width: card.width - 24,
          height: card.height - 16,
          opacity: 1,
          rotation: 0,
          animation: "none",
          delay: 0,
          duration: 1,
          strokeWidth: 0,
        },
        0,
      );
    }
  if (s?.scene?.effects?.halftone ?? project.style === "collage") {
    c.save();
    c.globalAlpha = 0.1;
    c.fillStyle = "#392c24";
    for (let y = 0; y < logicalHeight; y += 9)
      for (let x = (Math.floor(y / 9) % 2) * 4.5; x < logicalWidth; x += 9) {
        c.beginPath();
        c.arc(x, y, 0.8, 0, Math.PI * 2);
        c.fill();
      }
    c.restore();
  }
  c.restore();
  if (project.style === "pixel") {
    const image = c.getImageData(0, 0, canvas.width, canvas.height),
      bands = Math.max(
        2,
        Math.min(
          16,
          Number(project.styleParams?.colorBands) ||
            (project.look === "Expanded palette" ? 8 : 4),
        ),
      );
    for (let i = 0; i < image.data.length; i += 4)
      for (let channel = 0; channel < 3; channel++)
        image.data[i + channel] =
          (Math.round((image.data[i + channel] / 255) * (bands - 1)) /
            (bands - 1)) *
          255;
    c.putImageData(image, 0, 0);
  }
  return { shotId: s?.id, metrics };
}
async function setProject(p) {
  if (p.baseStyle && p.baseStyle !== p.style) {
    const module = await import(
      `/api/styles/${encodeURIComponent(p.style)}/module?v=${encodeURIComponent(p.updatedAt || "")}`
    );
    p = {
      ...p,
      style: p.baseStyle,
      shots: p.shots.map((s) => ({
        ...s,
        scene: s.scene ? module.applyStyle(s.scene) : s.scene,
      })),
    };
  }
  if (p.styleParams?.effects || p.styleParams?.lighting)
    p = {
      ...p,
      shots: p.shots.map((s) => ({
        ...s,
        scene: s.scene
          ? {
              ...s.scene,
              effects: { ...s.scene.effects, ...p.styleParams.effects },
              ...(p.styleParams.lighting
                ? {
                    lighting: {
                      ...s.scene.lighting,
                      ...p.styleParams.lighting,
                    },
                  }
                : {}),
            }
          : s.scene,
      })),
    };
  project = p;
  shot = null;
  logicalWidth = p.format === "9:16" ? 720 : 1280;
  logicalHeight = p.format === "9:16" ? 1280 : 720;
  if (!params.has("width")) {
    width = logicalWidth;
    height = logicalHeight;
  }
  canvas.width =
    p.style === "pixel" ? (p.format === "9:16" ? 360 : 640) : width;
  canvas.height =
    p.style === "pixel" ? (p.format === "9:16" ? 640 : 360) : height;
  canvas.style.imageRendering = p.style === "pixel" ? "pixelated" : "auto";
  if (renderer) renderer.setSize(width, height);
  images.clear();
  models.clear();
  videos.forEach((v) => {
    v.pause();
    v.removeAttribute("src");
    v.load();
  });
  videos.clear();
  const mediaElements = p.shots.flatMap((s) => s.scene?.elements || []);
  if (p.sourceVideo) mediaElements.push({ type: "video", src: p.sourceVideo });
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (
      url.startsWith(`/media/${p.id}/assets/`) ||
      url.startsWith("blob:") ||
      url.startsWith("data:")
    )
      return url;
    throw Error("3D models must embed textures or use project assets");
  });
  const loader = new GLTFLoader(manager);
  await Promise.all(
    [
      ...new Set(
        mediaElements.filter((e) => e.type === "model").map((e) => e.src),
      ),
    ].map(async (src) =>
      models.set(src, await loader.loadAsync(`/media/${p.id}/${src}`)),
    ),
  );
  await Promise.all(
    [
      ...new Set(
        mediaElements.filter((e) => e.type === "video").map((e) => e.src),
      ),
    ].map(
      (src) =>
        new Promise((resolve, reject) => {
          const v = document.createElement("video");
          v.muted = true;
          v.preload = "auto";
          v.onloadeddata = () => {
            videos.set(src, v);
            resolve();
          };
          v.onerror = () => reject(Error("Cannot load video " + src));
          v.src = `/media/${p.id}/${src}`;
        }),
    ),
  );
  const sources = [
    ...new Set(
      p.shots.flatMap(
        (s) =>
          s.scene?.elements
            .filter((e) => e.type === "image")
            .map((e) => e.src) || [],
      ),
    ),
  ];
  await Promise.all(
    sources.map(
      (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(src, img);
            resolve();
          };
          img.onerror = () => reject(Error("Cannot load image " + src));
          img.src = `/media/${p.id}/${src}`;
        }),
    ),
  );
  render(currentTime);
}
function videoTime(e, t, v) {
  if (e.camera) {
    const cut = project.cameraCuts?.findLast(
      (c) => t >= c.outputStart && t <= c.outputEnd + 0.001,
    );
    const local =
      (cut ? cut.sourceStart + t - cut.outputStart : t) +
      (project.cameraAudioOffset || 0);
    return Math.max(0, Math.min(local, v.duration - 0.04));
  }
  const local = Math.max(0, t - shot.start + (e.offset || 0));
  return e.loop !== false
    ? local % v.duration
    : Math.min(local, Math.max(0, v.duration - 0.04));
}
async function renderFrame(t) {
  const initial = render(t);
  const targets = (shot?.scene?.elements || []).filter(
    (e) => e.type === "video",
  );
  if (project.sourceVideo)
    targets.push({ src: project.sourceVideo, camera: true });
  if (!targets.length) return initial;
  await Promise.all(
    targets.map(
      (e) =>
        new Promise((resolve, reject) => {
          const v = videos.get(e.src);
          if (!v) return reject(Error("Missing video " + e.src));
          const time = videoTime(e, t, v);
          if (Math.abs(v.currentTime - time) < 0.0001 && !v.seeking)
            return resolve();
          const timeout = setTimeout(() => {
            v.removeEventListener("seeked", done);
            reject(Error("Video seek timed out"));
          }, 15000);
          function done() {
            clearTimeout(timeout);
            resolve();
          }
          v.addEventListener("seeked", done, { once: true });
          v.currentTime = time;
        }),
    ),
  );
  return render(t);
}
window.FC = {
  setProject,
  render,
  renderFrame,
  getProject: () => project,
  getMetrics: () => metrics,
  setSelection: (id) => {
    selected = id;
    render(currentTime);
  },
};
window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin) return;
  try {
    if (event.data.type === "project") await setProject(event.data.project);
    if (event.data.type === "time") {
      if (videos.size) await renderFrame(event.data.time);
      else render(event.data.time);
    }
    if (event.data.type === "selection") {
      selected = event.data.id;
      render(currentTime);
    }
  } catch (e) {
    const el = document.querySelector("#error");
    el.style.display = "grid";
    el.textContent = e.message;
  }
});
canvas.addEventListener("click", (event) => {
  const r = canvas.getBoundingClientRect(),
    x = ((event.clientX - r.left) / r.width) * logicalWidth,
    y = ((event.clientY - r.top) / r.height) * logicalHeight;
  const e = [...(shot?.scene?.elements || [])]
    .filter((e) => !geometryTypes.includes(e.type))
    .reverse()
    .find((e) => {
      const m = metrics.find((m) => m.id === e.id && m.visible && m.bounds);
      return m
        ? x >= m.bounds.left &&
            x <= m.bounds.right &&
            y >= m.bounds.top &&
            y <= m.bounds.bottom
        : false;
    });
  let hit;
  if (!e && world && threeCanvas.style.display !== "none") {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (x / logicalWidth) * 2 - 1,
        (-y / logicalHeight) * 2 + 1,
      ),
      camera,
    );
    hit = ray
      .intersectObjects(world.children, true)
      .find((h) => h.object.userData.id);
  }
  selected = e?.id || hit?.object.userData.id || null;
  render(currentTime);
  parent.postMessage(
    { type: "selection", id: selected, shotId: shot?.id },
    location.origin,
  );
});
threeCanvas.addEventListener("click", (event) => {
  if (!world) return;
  const r = threeCanvas.getBoundingClientRect(),
    ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      (-(event.clientY - r.top) / r.height) * 2 + 1,
    ),
    camera,
  );
  const hit = ray
    .intersectObjects(world.children)
    .find((h) => h.object.userData.id);
  parent.postMessage(
    {
      type: "selection",
      id: hit?.object.userData.id || null,
      shotId: shot?.id,
    },
    location.origin,
  );
});
if (params.get("project")) {
  const response = await fetch("/api/projects/" + params.get("project"));
  await setProject(await response.json());
}
if (params.get("character")) {
  const response = await fetch(
    `/api/characters/${encodeURIComponent(params.get("character"))}/preview?pose=${encodeURIComponent(params.get("pose") || "idle")}`,
  );
  if (!response.ok) throw Error("Character preview could not load");
  await setProject(await response.json());
  const begin = performance.now();
  const animate = (now) => {
    render(((now - begin) / 1000) % 8);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
if (params.get("preview")) {
  const response = await fetch(
    `/api/styles/${encodeURIComponent(params.get("preview"))}/preview?look=${encodeURIComponent(params.get("look") || "")}`,
  );
  if (!response.ok) throw Error("Style preview is unavailable");
  await setProject(await response.json());
  const begin = performance.now();
  const animate = (now) => {
    render(((now - begin) / 1000) % 8);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
window.ready = true;
parent.postMessage({ type: "ready" }, location.origin);

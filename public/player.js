import * as THREE from "/vendor/three.module.js";
import { GLTFLoader } from "/three-addons/loaders/GLTFLoader.js";
import { clone } from "/three-addons/utils/SkeletonUtils.js";
const models = new Map(),
  videos = new Map();
const canvas = document.querySelector("#stage"),
  c = canvas.getContext("2d"),
  threeCanvas = document.querySelector("#three");
let renderer,
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
  let p = ease((t - e.delay) / e.duration),
    x = e.x,
    y = e.y,
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
  return { x, y, scale, rotation, opacity };
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
  const a = transform(e, t);
  let metric = { id: e.id, type: e.type, visible: a.opacity > 0.01 };
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
  if (e.type === "rect") {
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
  if (["rect", "circle", "text", "image", "video", "line"].includes(e.type)) {
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
  threeCanvas.style.display = "none";
  if (
    !s?.scene?.elements.some((e) =>
      ["box", "sphere", "cylinder", "cone", "model"].includes(e.type),
    )
  )
    return;
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
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    });
  world = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
  const cp = s.scene.camera || { x: 12, y: 10, z: 18 };
  camera.position.set(cp.x, cp.y, cp.z);
  camera.lookAt(0, 1, 0);
  world.add(new THREE.HemisphereLight(0xe6f0ff, 0x4b5260, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(8, 16, 10);
  world.add(light);
  meshes = [];
  for (const e of s.scene.elements) {
    if (e.type === "model") {
      const asset = models.get(e.src);
      if (!asset) continue;
      const m = clone(asset.scene);
      m.traverse((o) => {
        o.userData.id = e.id;
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
    let g;
    if (e.type === "box") g = new THREE.BoxGeometry(e.width, e.height, e.depth);
    if (e.type === "sphere") g = new THREE.SphereGeometry(e.radius, 32, 24);
    if (e.type === "cylinder")
      g = new THREE.CylinderGeometry(e.radius, e.radius, e.height, 32);
    if (e.type === "cone") g = new THREE.ConeGeometry(e.radius, e.height, 32);
    if (!g) continue;
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color: e.fill, roughness: 0.85 }),
    );
    m.position.set(e.x, e.y, e.z);
    m.userData.id = e.id;
    world.add(m);
    meshes.push({ m, e });
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
  if (s?.scene) {
    const local = Math.max(0, t - s.start);
    for (const e of s.scene.elements)
      if (!["box", "sphere", "cylinder", "cone", "model"].includes(e.type))
        draw(e, local);
    if (s.scene.label || project.style === "3d") {
      c.fillStyle = "rgba(0,0,0,.6)";
      c.fillRect(logicalWidth - 270, 24, 246, 34);
      c.fillStyle = "#fff";
      c.font = "13px monospace";
      c.textAlign = "center";
      c.fillText(s.scene.label || "RECONSTRUCTION", logicalWidth - 147, 46);
    }
    for (const { m, e, mixer } of meshes) {
      const a = transform(e, local);
      m.position.set(a.x, a.y, e.z);
      m.rotation.y = (a.rotation * Math.PI) / 180;
      m.scale.setScalar(a.scale * (e.scale || 1));
      mixer?.setTime(local);
      m.traverse((o) => {
        for (const material of Array.isArray(o.material)
          ? o.material
          : o.material
            ? [o.material]
            : []) {
          material.opacity = a.opacity;
          material.transparent = a.opacity < 1;
        }
      });
    }
    if (renderer && threeCanvas.style.display !== "none")
      renderer.render(world, camera);
  } else {
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
  c.restore();
  return { shotId: s?.id, metrics };
}
async function setProject(p) {
  project = p;
  shot = null;
  logicalWidth = p.format === "9:16" ? 720 : 1280;
  logicalHeight = p.format === "9:16" ? 1280 : 720;
  if (!params.has("width")) {
    width = logicalWidth;
    height = logicalHeight;
  }
  canvas.width = p.style === "pixel" ? Math.round(width / 2) : width;
  canvas.height = p.style === "pixel" ? Math.round(height / 2) : height;
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
  const local = Math.max(0, t - shot.start + (e.offset || 0));
  return e.loop !== false
    ? local % v.duration
    : Math.min(local, Math.max(0, v.duration - 0.04));
}
async function renderFrame(t) {
  render(t);
  const targets = (shot?.scene?.elements || []).filter(
    (e) => e.type === "video",
  );
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
    .reverse()
    .find(
      (e) =>
        Math.abs(x - e.x) < (e.type === "circle" ? e.radius : e.width / 2) &&
        Math.abs(y - e.y) < (e.type === "circle" ? e.radius : e.height / 2),
    );
  selected = e?.id || null;
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
window.ready = true;
parent.postMessage({ type: "ready" }, location.origin);

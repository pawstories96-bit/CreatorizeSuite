import fs from "node:fs";
import path from "node:path";
import "./license-notices.mjs";
import "./prepare-model-tools.mjs";
// electron-builder excludes dependency directories named "examples". These
// three runtime modules are required by our GLB renderer, so bundle explicitly.
const copied = new Set();
function copyModule(file) {
  file = file.replaceAll("\\", "/");
  if (copied.has(file)) return;
  if (file.startsWith("../") || path.isAbsolute(file)) throw Error("Invalid Three.js module dependency");
  copied.add(file);
  const original = path.join("node_modules", "three", "examples", "jsm", file);
  const target = path.join("public", "three-addons", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const source = fs.readFileSync(original, "utf8");
  fs.writeFileSync(target, source);
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["'](\.[^"']+\.js)["']/g)) copyModule(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
}
for (const file of [
  "loaders/GLTFLoader.js",
  "loaders/FBXLoader.js",
  "exporters/GLTFExporter.js",
  "utils/SkeletonUtils.js",
  "utils/BufferGeometryUtils.js",
  "objects/Reflector.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/RenderPass.js",
  "postprocessing/SSAOPass.js",
  "postprocessing/UnrealBloomPass.js",
  "postprocessing/FilmPass.js",
  "postprocessing/OutlinePass.js",
  "postprocessing/OutputPass.js",
]) {
  copyModule(file);
}
fs.copyFileSync("node_modules/three/LICENSE", "public/three-addons/LICENSE");

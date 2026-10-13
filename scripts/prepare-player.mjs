import fs from "node:fs";
import path from "node:path";
// electron-builder excludes dependency directories named "examples". These
// three runtime modules are required by our GLB renderer, so bundle explicitly.
for (const file of [
  "loaders/GLTFLoader.js",
  "utils/SkeletonUtils.js",
  "utils/BufferGeometryUtils.js",
]) {
  const target = path.join("public", "three-addons", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(
    path.join("node_modules", "three", "examples", "jsm", file),
    target,
  );
}
fs.copyFileSync("node_modules/three/LICENSE", "public/three-addons/LICENSE");

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./core.mjs";
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function legacyFBX(bytes) {
  if (bytes.subarray(0, 18).toString() === "Kaydara FBX Binary")
    return bytes.readUInt32LE(23) < 7000;
  const version = bytes
    .subarray(0, 8192)
    .toString()
    .match(/FBXVersion:\s*(\d+)/);
  return !!version && Number(version[1]) < 7000;
}
export async function convertLegacyFBX(bytes, incoming) {
  const converter = [
    process.env.CREATORIZE_FBX_CONVERTER,
    path.join(appRoot, "resources", "models", "FBX2glTF.exe"),
    process.resourcesPath &&
      path.join(process.resourcesPath, "models", "FBX2glTF.exe"),
  ].find((p) => p && fs.existsSync(p));
  if (!converter)
    throw Error(
      "Legacy FBX conversion is unavailable. Install the bundled FBX2glTF converter or export this character as FBX 7 / GLB.",
    );
  const parent = path.resolve(incoming),
    temporary = fs.mkdtempSync(path.join(parent, "legacy-rig-"));
  try {
    const input = path.join(temporary, "source.fbx"),
      output = path.join(temporary, "converted.glb");
    fs.writeFileSync(input, bytes);
    await run(
      converter,
      [
        "--binary",
        "--input",
        input,
        "--output",
        output,
        "--fbx-temp-dir",
        temporary,
      ],
      { timeout: 120000 },
    );
    if (!fs.existsSync(output))
      throw Error("Legacy FBX converter did not produce a model");
    return fs.readFileSync(output);
  } finally {
    // Only remove the freshly created child of this workspace's incoming folder.
    const resolved = path.resolve(temporary);
    if (
      resolved.startsWith(parent + path.sep) &&
      path.basename(resolved).startsWith("legacy-rig-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  }
}

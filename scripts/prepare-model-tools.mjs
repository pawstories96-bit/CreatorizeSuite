import fs from "node:fs";
import crypto from "node:crypto";
const url =
  "https://github.com/facebookincubator/FBX2glTF/releases/download/v0.9.7/FBX2glTF-windows-x64.exe";
const sha256 =
  "8d90fb5e0a8d186a3d9a7ff8c75eaee541c3975ce4df0d80351f20092ae0877f";
const destination = "resources/models/FBX2glTF.exe";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
if (
  !fs.existsSync(destination) ||
  hash(fs.readFileSync(destination)) !== sha256
) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw Error("Cannot download the legacy FBX converter: " + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== sha256) throw Error("FBX converter checksum mismatch");
  fs.mkdirSync("resources/models", { recursive: true });
  fs.writeFileSync(destination, bytes);
}
if (!fs.existsSync("resources/licenses/FBX2glTF.txt")) {
  const response = await fetch(
    "https://raw.githubusercontent.com/facebookincubator/FBX2glTF/v0.9.7/LICENSE",
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw Error("Cannot retrieve the FBX converter distribution notice");
  fs.mkdirSync("resources/licenses", { recursive: true });
  fs.writeFileSync("resources/licenses/FBX2glTF.txt", await response.text());
}

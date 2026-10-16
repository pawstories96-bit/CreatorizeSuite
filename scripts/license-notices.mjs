import fs from "node:fs";
import path from "node:path";
// These packages are compiled into the static interface and are not installed
// as desktop runtime dependencies. Retain their distribution notices explicitly.
const packages = [
  "@fontsource-variable/dm-sans",
  "@fontsource-variable/manrope",
  "@xyflow/react",
  "lucide-react",
  "next",
  "react",
  "react-dom",
  "tailwindcss",
  "zustand",
];
fs.mkdirSync("resources/licenses", { recursive: true });
for (const name of packages) {
  const root = path.join("node_modules", name),
    license = ["LICENSE", "LICENSE.md", "license.md", "LICENSE.txt"].find(
      (file) => fs.existsSync(path.join(root, file)),
    );
  if (!license) throw Error("Missing distribution notice for " + name);
  fs.copyFileSync(
    path.join(root, license),
    path.join("resources/licenses", name.replaceAll("/", "-") + ".txt"),
  );
}

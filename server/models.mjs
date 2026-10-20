import path from "node:path";
import crypto from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { publicDownload } from "./research.mjs";
import { atomic, read } from "./core.mjs";
import {
  searchKenney,
  downloadKenney,
  documentBounds,
} from "./kenney-models.mjs";
async function officialJSON(url) {
  return JSON.parse(
    (await publicDownload(url, 12 * 1024 * 1024)).bytes.toString("utf8"),
  );
}
async function modelCatalog(store) {
  const saved = store.get("assetCatalogs", "polyhaven-models");
  if (saved && Date.now() - saved.fetchedAt < 86400000) return saved.assets;
  const assets = await officialJSON(
    "https://api.polyhaven.com/assets?t=models",
  );
  store.put("assetCatalogs", {
    id: "polyhaven-models",
    assets,
    fetchedAt: Date.now(),
  });
  return assets;
}
export async function searchModels(store, query) {
  const words = String(query || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.join(" ").length > 150)
    throw Error("Enter a model search up to 150 characters");
  const found = await Promise.allSettled([
    searchKenney(store, query),
    modelCatalog(store),
  ]);
  if (found.every((r) => r.status === "rejected"))
    throw Error(found.map((r) => r.reason.message).join("; "));
  const haven = Object.entries(
    found[1].status === "fulfilled" ? found[1].value : {},
  )
    .filter(
      ([id, item]) =>
        item.type === 2 &&
        words.every((w) =>
          `${id} ${item.name} ${(item.tags || []).join(" ")} ${(item.categories || []).join(" ")}`
            .toLowerCase()
            .includes(w),
        ),
    )
    .slice(0, 30)
    .map(([id, item]) => ({
      id,
      name: item.name,
      preview:
        item.thumbnail_url ||
        `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
      source: `https://polyhaven.com/a/${id}`,
      license: "CC0",
      licenseSource: "https://polyhaven.com/license",
      author: Object.keys(item.authors || {}).join(", "),
      dimensionsMeters: item.dimensions?.map((v) => v / 1000),
      polycount: item.polycount,
    }));
  // Include both catalogs; an outage in one provider must not hide the other.
  const kenney = found[0].status === "fulfilled" ? found[0].value : [];
  const results = Array.from(
    { length: Math.max(haven.length, kenney.length) },
    (_, i) => [haven[i], kenney[i]].filter(Boolean),
  )
    .flat()
    .slice(0, 40);
  if (!results.length && found.some((r) => r.status === "rejected"))
    throw Error(
      `Model search was incomplete: ${found
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason.message)
        .join("; ")}`,
    );
  return results;
}
export async function downloadModel(store, p, id, job = {}, emit = () => {}) {
  if (id.startsWith("kenney:")) return downloadKenney(store, p, id, job, emit);
  if (!/^[\w-]+$/.test(id)) throw Error("Choose a model ID from the catalog");
  const info = (await modelCatalog(store))[id];
  if (!info || info.type !== 2)
    throw Error("Model was not found in the public CC0 catalog");
  const files = await officialJSON(`https://api.polyhaven.com/files/${id}`),
    file = files.gltf?.["1k"]?.gltf || files.gltf?.["2k"]?.gltf;
  if (!file?.url) throw Error("This model has no supported glTF download");
  const includes = Object.entries(file.include || {});
  if (
    includes.length > 60 ||
    includes.reduce(
      (sum, [, item]) => sum + Number(item.size || 0),
      Number(file.size || 0),
    ) >
      128 * 1024 * 1024
  )
    throw Error("Model exceeds the 128 MB import limit");
  const download = async (item) => {
    if (job.cancelled) throw Error("Stopped by user");
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.hostname !== "dl.polyhaven.org")
      throw Error("Model resource is outside the catalog’s download host");
    const { bytes } = await publicDownload(url.href, 64 * 1024 * 1024);
    if (
      item.md5 &&
      crypto.createHash("md5").update(bytes).digest("hex") !== item.md5
    )
      throw Error("Model resource failed its published checksum");
    return bytes;
  };
  emit("info", `Downloading ${info.name} geometry and textures`);
  const json = JSON.parse((await download(file)).toString("utf8")),
    resources = {};
  let total = 0;
  for (const [key, resource] of includes) {
    const bytes = await download(resource);
    total += bytes.length;
    if (total > 128 * 1024 * 1024)
      throw Error("Model resources exceed the import limit");
    resources[key] = bytes;
  }
  for (const item of [...(json.buffers || []), ...(json.images || [])])
    if (
      item.uri &&
      !item.uri.startsWith("data:") &&
      !Object.hasOwn(resources, item.uri)
    )
      throw Error("Model references an unlisted external resource");
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .setStrictResources(true);
  const document = await io.readJSON({ json, resources }),
    binary = Buffer.from(await io.writeBinary(document));
  const rel = `assets/model-${id}-${crypto.createHash("sha256").update(binary).digest("hex").slice(0, 12)}.glb`;
  atomic(path.join(store.projectDir(p.id), rel), binary);
  const record = {
    id,
    path: rel,
    name: info.name,
    license: "CC0",
    author: Object.keys(info.authors || {}).join(", "),
    source: `https://polyhaven.com/a/${id}`,
    licenseSource: "https://polyhaven.com/license",
    retrievedAt: new Date().toISOString(),
    dimensionsMeters: documentBounds(document).size,
    bounds: documentBounds(document),
    sha256: crypto.createHash("sha256").update(binary).digest("hex"),
    embeddedResources: includes.length,
  };
  const ledgerFile = path.join(
      store.projectDir(p.id),
      "assets",
      "ATTRIBUTIONS.json",
    ),
    ledger = read(ledgerFile, []);
  atomic(ledgerFile, [...ledger.filter((a) => a.path !== rel), record]);
  return record;
}

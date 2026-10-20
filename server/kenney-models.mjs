import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { publicDownload } from "./research.mjs";
import { atomic, read } from "./core.mjs";

// Resolve downloads from the author's current page, rather than guessing CDN URLs.
const packs = [
  {
    id: "watercraft-kit",
    words:
      "ship boat cargo container tug watercraft buoy ocean vessel harbor harbour port",
  },
  {
    id: "nature-kit",
    words:
      "tree nature forest grass rock cliff bush plant terrain fence bridge",
  },
  {
    id: "city-kit-industrial",
    words: "industrial factory warehouse building chimney tank city",
  },
  { id: "car-kit", words: "car truck vehicle van bus road traffic" },
  {
    id: "furniture-kit",
    words: "furniture chair desk table bed sofa cabinet interior seat",
  },
];
const pending = new Map();
const tokens = (text) =>
  String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/shipping/g, "cargo")
    .replace(/vessel/g, "ship")
    .match(/[a-z0-9]+/g) || [];
const cancelled = (job) => {
  if (job?.cancelled) throw Error("Stopped by user");
};

async function packArchive(store, pack, job) {
  const key = `${store.root}:${pack.id}`;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const file = path.join(
      store.root,
      "cache",
      "models",
      `kenney-${pack.id}.zip`,
    );
    let bytes;
    if (fs.existsSync(file)) bytes = fs.readFileSync(file);
    else {
      cancelled(job);
      const source = `https://kenney.nl/assets/${pack.id}`;
      const html = (
        await publicDownload(source, 2 * 1024 * 1024)
      ).bytes.toString("utf8");
      if (
        !/Creative Commons CC0|CC0 1\.0|href=["']https?:\/\/creativecommons.org\/publicdomain\/zero/i.test(
          html,
        )
      )
        throw Error(
          `The author no longer advertises a CC0 license for ${pack.id}`,
        );
      const matches = [
        ...html.matchAll(/href=["']([^"']+\.zip(?:\?[^"']*)?)["']/gi),
      ];
      const url = matches
        .map((m) => new URL(m[1], source))
        .find(
          (u) =>
            u.protocol === "https:" &&
            u.hostname === "kenney.nl" &&
            u.pathname.startsWith(`/media/pages/assets/${pack.id}/`),
        );
      if (!url) throw Error(`No official download is available for ${pack.id}`);
      bytes = (await publicDownload(url.href, 96 * 1024 * 1024)).bytes;
      atomic(file, bytes);
    }
    const zip = new AdmZip(bytes),
      entries = zip.getEntries();
    if (
      entries.length > 10000 ||
      entries.reduce((n, e) => n + e.header.size, 0) > 512 * 1024 * 1024
    )
      throw Error("Model pack exceeds the unpacked size limit");
    const license = entries.find((e) =>
      /(^|\/)license\.txt$/i.test(e.entryName),
    );
    if (!license || !/CC0|Creative Commons Zero/i.test(zip.readAsText(license)))
      throw Error("Model archive is missing its CC0 license");
    const models = entries.filter(
      (e) =>
        /\.glb$/i.test(e.entryName) &&
        !e.entryName.includes("..") &&
        !e.entryName.startsWith("/"),
    );
    if (!models.length)
      throw Error(`No self-contained GLB models in ${pack.id}`);
    return {
      zip,
      models,
      checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

export async function searchKenney(store, query) {
  const words = tokens(query).filter(
    (w) => !["3d", "model", "low", "poly", "a", "the"].includes(w),
  );
  const relevant = packs
    .filter((p) =>
      words.some(
        (w) =>
          tokens(p.words).includes(w.replace(/s$/, "")) ||
          tokens(p.words).includes(w),
      ),
    )
    .slice(0, 2);
  const results = [];
  for (const pack of relevant) {
    const { models } = await packArchive(store, pack);
    for (const entry of models) {
      const stem = path.posix.basename(entry.entryName, ".glb"),
        terms = tokens(stem);
      const score = words.filter((w) =>
        terms.some(
          (t) => t === w || t.replace(/s$/, "") === w.replace(/s$/, ""),
        ),
      ).length;
      if (!score || score < words.length) continue;
      results.push({
        id: `kenney:${pack.id}:${stem}`,
        name: stem.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " "),
        source: `https://kenney.nl/assets/${pack.id}`,
        license: "CC0",
        licenseSource: "https://creativecommons.org/publicdomain/zero/1.0/",
        author: "Kenney",
        provider: "Kenney",
        appearance:
          "Stylized low-poly; generic prop, not an exact historical replica",
      });
    }
  }
  // Show distinct base shapes before their seasonal/color variants.
  return results
    .sort(
      (a, b) =>
        a.name.split(" ").length - b.name.split(" ").length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 30);
}

export function documentBounds(document) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const lo = position.getMin([]),
        hi = position.getMax([]);
      for (const x of [lo[0], hi[0]])
        for (const y of [lo[1], hi[1]])
          for (const z of [lo[2], hi[2]]) {
            const v = [
              m[0] * x + m[4] * y + m[8] * z + m[12],
              m[1] * x + m[5] * y + m[9] * z + m[13],
              m[2] * x + m[6] * y + m[10] * z + m[14],
            ];
            v.forEach((n, i) => {
              min[i] = Math.min(min[i], n);
              max[i] = Math.max(max[i], n);
            });
          }
    }
  }
  if (!min.every(Number.isFinite))
    throw Error("Model has no measurable geometry");
  return { min, max, size: max.map((n, i) => n - min[i]) };
}

export async function downloadKenney(store, p, id, job, emit) {
  const match = /^kenney:([\w-]+):([\w-]+)$/.exec(id),
    pack = packs.find((v) => v.id === match?.[1]);
  if (!pack) throw Error("Choose a model ID from the catalog");
  cancelled(job);
  emit("info", `Downloading Kenney ${match[2]} from the official CC0 pack`);
  const { zip, models, checksum } = await packArchive(store, pack, job);
  const entry = models.find(
    (e) => path.posix.basename(e.entryName, ".glb") === match[2],
  );
  if (!entry || entry.header.size > 64 * 1024 * 1024)
    throw Error("Model is missing or exceeds the size limit");
  const original = zip.readFile(entry);
  // Some author GLBs keep their palette beside the model. Resolve resources
  // only inside this verified archive, then embed them in the imported GLB.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .setStrictResources(true);
  if (
    original.toString("ascii", 0, 4) !== "glTF" ||
    original.readUInt32LE(4) !== 2 ||
    original.readUInt32LE(8) !== original.length
  )
    throw Error("Invalid GLB archive entry");
  let offset = 12,
    json,
    bin;
  while (offset + 8 <= original.length) {
    const length = original.readUInt32LE(offset),
      type = original.readUInt32LE(offset + 4);
    if (offset + 8 + length > original.length)
      throw Error("Truncated GLB chunk");
    if (type === 0x4e4f534a)
      json = JSON.parse(
        original.toString("utf8", offset + 8, offset + 8 + length),
      );
    if (type === 0x004e4942)
      bin = original.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  if (!json) throw Error("GLB has no JSON chunk");
  const resources = {},
    base = path.posix.dirname(entry.entryName);
  if (bin && json.buffers?.[0] && !json.buffers[0].uri) {
    json.buffers[0].uri = "creatorize-internal-buffer.bin";
    resources[json.buffers[0].uri] = bin;
  }
  const references = [...(json.buffers || []), ...(json.images || [])];
  if (references.length > 64)
    throw Error("Model has too many external resources");
  for (const item of references) {
    if (
      !item.uri ||
      item.uri.startsWith("data:") ||
      Object.hasOwn(resources, item.uri)
    )
      continue;
    if (/^[a-z]+:|\\|\0/i.test(item.uri))
      throw Error("Model references a non-archive resource");
    const resourcePath = path.posix.normalize(
      path.posix.join(base, decodeURIComponent(item.uri)),
    );
    if (!resourcePath.startsWith(base + "/"))
      throw Error("Model resource leaves its archive directory");
    const resource = zip.getEntry(resourcePath);
    if (!resource || resource.header.size > 32 * 1024 * 1024)
      throw Error("Model resource is missing or too large");
    resources[item.uri] = zip.readFile(resource);
  }
  const document = await io.readJSON({ json, resources }),
    bounds = documentBounds(document);
  const bytes = Buffer.from(await io.writeBinary(document));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const rel = `assets/kenney-${pack.id}-${match[2]}-${sha256.slice(0, 12)}.glb`;
  cancelled(job);
  atomic(path.join(store.projectDir(p.id), rel), bytes);
  const record = {
    id,
    path: rel,
    name: match[2].replace(/[_-]/g, " "),
    provider: "Kenney",
    license: "CC0",
    author: "Kenney",
    source: `https://kenney.nl/assets/${pack.id}`,
    licenseSource: "https://creativecommons.org/publicdomain/zero/1.0/",
    retrievedAt: new Date().toISOString(),
    sha256,
    archiveSha256: checksum,
    bounds,
    dimensionsMeters: bounds.size,
    embeddedResources: document.getRoot().listTextures().length,
    appearance:
      "Stylized generic prop. Do not describe this as an exact historical model.",
    placement:
      "Native origin and orientation are preserved. Use bounds.min/max to place the base or waterline and dimensionsMeters times scale for sizing.",
  };
  const ledgerFile = path.join(
    store.projectDir(p.id),
    "assets",
    "ATTRIBUTIONS.json",
  );
  atomic(ledgerFile, [
    ...read(ledgerFile, []).filter((a) => a.path !== rel),
    record,
  ]);
  return record;
}

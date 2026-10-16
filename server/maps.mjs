import path from "node:path";
import crypto from "node:crypto";
import { PNG } from "pngjs";
import { XMLParser } from "fast-xml-parser";
import { atomic, read, validateScene } from "./core.mjs";
import { publicDownload } from "./research.mjs";
export const terrainCredits =
  "Terrain Tiles: Mapzen/Tilezen. Sources include USGS 3DEP, GMTED2010 and SRTM; NOAA ETOPO1; Copernicus EU-DEM; ArcticDEM; Geoscience Australia; Austrian open data; Canada Open Government Licence; INEGI Mexico; LINZ New Zealand; Kartverket Norway; UK Environment Agency. Full source-specific attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md";
export function parseOSM(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Map XML must not contain document types or external entities");
  const data = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
  }).parse(xml).osm;
  const array = (value) =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  const nodes = new Map(
    array(data?.node).map((n) => [
      String(n["@_id"]),
      { lat: n["@_lat"], lon: n["@_lon"] },
    ]),
  );
  return {
    elements: array(data?.way).map((w) => ({
      id: w["@_id"],
      tags: Object.fromEntries(
        array(w.tag).map((t) => [t["@_k"], String(t["@_v"])]),
      ),
      geometry: array(w.nd)
        .map((n) => nodes.get(String(n["@_ref"])))
        .filter(Boolean),
    })),
  };
}
export function validateMap(input) {
  const lat = Number(input.lat),
    lon = Number(input.lon),
    radius = Number(input.radius ?? 250);
  if (
    !Number.isFinite(lat) ||
    Math.abs(lat) > 80 ||
    !Number.isFinite(lon) ||
    Math.abs(lon) > 179 ||
    !Number.isFinite(radius) ||
    radius < 50 ||
    radius > 1000
  )
    throw Error(
      "Use a map center within ±80° latitude and a radius of 50–1,000 meters",
    );
  const dy = radius / 111320,
    dx = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    lat,
    lon,
    radius,
    bbox: [lat - dy, lon - dx, lat + dy, lon + dx],
    terrain: input.terrain !== false,
  };
}
const pixel = (lat, lon, zoom) => {
  const sin = Math.sin((lat * Math.PI) / 180),
    size = 256 * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
};
export async function terrainGrid(area, signal) {
  const size = 33,
    zoom = 12,
    tiles = new Map(),
    values = [],
    [south, west, north, east] = area.bbox;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      signal?.throwIfAborted();
      const p = pixel(
          north - ((north - south) * row) / (size - 1),
          west + ((east - west) * col) / (size - 1),
          zoom,
        ),
        tx = Math.floor(p.x / 256),
        ty = Math.floor(p.y / 256),
        key = `${tx}/${ty}`;
      if (!tiles.has(key)) {
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${key}.png`;
        const { bytes } = await publicDownload(url, 3 * 1024 * 1024);
        tiles.set(key, PNG.sync.read(bytes));
      }
      const tile = tiles.get(key),
        offset =
          ((Math.floor(p.y) % 256) * tile.width + (Math.floor(p.x) % 256)) * 4;
      if (!tile.data[offset + 3])
        throw Error("Terrain tile has missing elevation data");
      values.push(
        tile.data[offset] * 256 +
          tile.data[offset + 1] +
          tile.data[offset + 2] / 256 -
          32768,
      );
    }
  const base = Math.min(...values);
  return {
    size,
    heights: values.map((v) => v - base),
    elevationOrigin: base,
    zoom,
    tiles: [...tiles.keys()],
  };
}
export function mapScene(area, data, grid) {
  const { lat, lon, radius } = area,
    meters = 111320,
    cos = Math.cos((lat * Math.PI) / 180);
  const xy = (p) => ({
    x: (p.lon - lon) * meters * cos,
    z: (lat - p.lat) * meters,
  });
  const elevation = (x, z) => {
    if (!grid) return 0;
    const col = Math.max(
        0,
        Math.min(
          grid.size - 1,
          Math.round(((x + radius) / (2 * radius)) * (grid.size - 1)),
        ),
      ),
      row = Math.max(
        0,
        Math.min(
          grid.size - 1,
          Math.round(((z + radius) / (2 * radius)) * (grid.size - 1)),
        ),
      );
    return grid.heights[row * grid.size + col];
  };
  const elements = [
    grid
      ? {
          id: "surveyed-terrain",
          type: "terrain",
          width: radius * 2,
          depth: radius * 2,
          gridSize: grid.size,
          heightMap: grid.heights,
          fill: "#b5c4a2",
        }
      : {
          id: "map-ground",
          type: "plane",
          width: radius * 2,
          height: radius * 2,
          rotation3d: { x: -90, y: 0, z: 0 },
          fill: "#c7d3b6",
        },
  ];
  let buildings = 0,
    roads = 0,
    estimated = 0;
  for (const way of data.elements || []) {
    const points = way.geometry
      ?.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map(xy);
    if (
      !points ||
      points.length < 2 ||
      points.length > 400 ||
      points.some(
        (p) => Math.abs(p.x) > radius * 1.5 || Math.abs(p.z) > radius * 1.5,
      )
    )
      continue;
    if (way.tags?.building && points.length >= 4 && buildings < 180) {
      if (
        Math.hypot(
          points[0].x - points.at(-1).x,
          points[0].z - points.at(-1).z,
        ) > 1
      )
        continue;
      const rawHeight = Number.parseFloat(way.tags.height),
        levels = Number.parseFloat(way.tags["building:levels"]),
        height = rawHeight > 0 ? rawHeight : levels > 0 ? levels * 3 : 6;
      if (!(rawHeight > 0)) estimated++;
      const center = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        z: points.reduce((s, p) => s + p.z, 0) / points.length,
      };
      elements.push({
        id: `osm-building-${way.id}`,
        type: "extrusion",
        points: points.map((p) => ({ x: p.x, y: -p.z, z: 0 })),
        depth: Math.min(500, height),
        y: elevation(center.x, center.z),
        rotation3d: { x: -90, y: 0, z: 0 },
        fill: "#e8e7df",
      });
      buildings++;
    } else if (way.tags?.highway && roads < 55) {
      elements.push({
        id: `osm-road-${way.id}`,
        type: "tube",
        points: points.map((p) => ({
          x: p.x,
          y: elevation(p.x, p.z) + 0.25,
          z: p.z,
        })),
        tubeRadius: 0.8,
        fill: "#6f7c7b",
      });
      roads++;
    }
  }
  if (!buildings && !roads)
    throw Error(
      "No supported buildings or roads were returned for this map area",
    );
  elements.push({
    id: "map-attribution",
    type: "text",
    x: 650,
    y: 680,
    width: 1180,
    height: 45,
    fontSize: 19,
    fill: "#17241c",
    text: `© OpenStreetMap contributors · ODbL${grid ? " · Terrain: Tilezen/USGS and regional sources" : ""}${estimated ? " · Some building heights estimated" : ""}`,
  });
  const maxHeight = Math.max(
    0,
    ...(grid?.heights || []),
    ...elements.filter((e) => e.type === "extrusion").map((e) => e.y + e.depth),
  );
  const extent = Math.max(radius * 2, maxHeight * 1.6);
  return {
    buildings,
    roads,
    estimatedHeights: estimated,
    scene: validateScene({
      background: "#dce5e3",
      label: "GEOGRAPHIC RECONSTRUCTION",
      camera: { x: extent * 0.85, y: extent + maxHeight * 0.4, z: extent },
      effects: { ssao: false },
      cameraRig: {
        type: "orbit",
        target: { x: 0, y: maxHeight * 0.4, z: 0 },
        radius: extent * 1.4,
        height: extent + maxHeight * 0.4,
        speed: 0.06,
      },
      elements,
    }),
  };
}
export async function fetchMap(store, p, input, job = {}) {
  const area = validateMap(input),
    key = crypto
      .createHash("sha256")
      .update(JSON.stringify(area))
      .digest("hex")
      .slice(0, 16),
    dir = store.projectDir(p.id),
    rel = `assets/map-${key}.scene.json`,
    cached = read(path.join(dir, rel));
  if (cached) return cached;
  const controller = new AbortController();
  job.abort = () => controller.abort();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(60000),
  ]);
  const query = `[out:json][timeout:25][maxsize:16777216];(way[building](${area.bbox.join(",")});way[highway](${area.bbox.join(",")}););out geom 350;`;
  const endpoint = new URL(
    store.settings().overpassUrl ||
      "https://overpass.private.coffee/api/interpreter",
  );
  if (
    !["https:", "http:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  )
    throw Error(
      "Use an HTTP(S) Overpass endpoint without credentials in its URL",
    );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "CreatorizeSuite/0.3 local video authoring",
    },
    body: new URLSearchParams({ data: query }),
    redirect: "error",
    signal,
  });
  let data,
    dataEndpoint = endpoint.href;
  if (!response.ok) {
    // A single small cached read can use the official bbox API during a
    // public Overpass outage. Never retry rate limits or sweep large areas.
    if (
      !store.settings().overpassUrl &&
      [500, 502, 503, 504].includes(response.status) &&
      area.radius <= 250
    ) {
      const [south, west, north, east] = area.bbox;
      dataEndpoint = `https://api.openstreetmap.org/api/0.6/map?bbox=${[west, south, east, north].join(",")}`;
      const fallback = await fetch(dataEndpoint, {
        headers: {
          "User-Agent": "CreatorizeSuite/0.3 local personal video authoring",
        },
        signal,
        redirect: "error",
      });
      if (!fallback.ok)
        throw Error(
          `OpenStreetMap fallback returned ${fallback.status}; retry later`,
        );
      const xml = await fallback.text();
      if (xml.length > 12 * 1024 * 1024)
        throw Error("Map fallback exceeds the small-area limit");
      data = parseOSM(xml);
    } else
      throw Error(
        `OpenStreetMap data service returned ${response.status}; retry later or choose another endpoint`,
      );
  } else {
    const text = await response.text();
    if (text.length > 20 * 1024 * 1024)
      throw Error("Map response is too large");
    data = JSON.parse(text);
  }
  if (data.remark) throw Error("Map query needs retry: " + data.remark);
  if (job.cancelled) throw Error("Stopped by user");
  const grid = area.terrain ? await terrainGrid(area, signal) : null,
    result = mapScene(area, data, grid);
  const record = {
    path: rel,
    name: `Map ${area.lat.toFixed(4)}, ${area.lon.toFixed(4)}`,
    ...result,
    area,
    elevationOrigin: grid?.elevationOrigin,
    source: "https://www.openstreetmap.org/copyright",
    dataEndpoint,
    license: "ODbL 1.0",
    author:
      "© OpenStreetMap contributors" + (grid ? "; " + terrainCredits : ""),
    retrievedAt: new Date().toISOString(),
    kind: "map",
  };
  atomic(path.join(dir, rel), record);
  atomic(path.join(dir, `assets/map-${key}.osm.json`), data);
  const ledger = path.join(dir, "assets", "ATTRIBUTIONS.json");
  atomic(ledger, [
    ...read(ledger, []).filter((a) => a.path !== rel),
    { ...record, scene: undefined },
  ]);
  return record;
}

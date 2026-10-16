import test from "node:test";
import assert from "node:assert/strict";
import { parseOSM, validateMap, mapScene } from "../server/maps.mjs";
import { validateScene } from "../server/core.mjs";
test("geographic imports constrain area and reject XML entities or incomplete height grids", () => {
  assert.throws(() => validateMap({ lat: 90, lon: 0, radius: 150 }));
  assert.throws(() => validateMap({ lat: 0, lon: 0, radius: 20000 }));
  assert.throws(
    () =>
      parseOSM(
        '<!DOCTYPE osm [<!ENTITY data SYSTEM "file:///private">]><osm/>',
      ),
    /entities/,
  );
  assert.throws(
    () =>
      validateScene({
        elements: [
          {
            id: "bad",
            type: "terrain",
            width: 100,
            depth: 100,
            gridSize: 3,
            heightMap: [0, 1, 2],
          },
        ],
      }),
    /complete square/,
  );
});
test("OSM footprints retain tagged heights, mark estimates, and terrain rows run north to south", () => {
  const xml =
    '<osm><node id="1" lat="0.0001" lon="-0.0001"/><node id="2" lat="0.0001" lon="0.0001"/><node id="3" lat="-0.0001" lon="0.0001"/><node id="4" lat="-0.0001" lon="-0.0001"/><way id="5"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="yes"/><tag k="height" v="12"/></way><way id="6"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way></osm>';
  const area = validateMap({ lat: 0, lon: 0, radius: 50 }),
    data = parseOSM(xml),
    grid = { size: 2, heights: [1, 2, 3, 4] },
    result = mapScene(area, data, grid);
  assert.equal(result.buildings, 1);
  assert.equal(result.roads, 1);
  assert.equal(result.estimatedHeights, 0);
  assert.equal(
    result.scene.elements.find((e) => e.type === "extrusion").depth,
    12,
  );
  delete data.elements[0].tags.height;
  assert.equal(mapScene(area, data, grid).estimatedHeights, 1);
  assert.deepEqual(result.scene.elements[0].heightMap, [1, 2, 3, 4]);
  const road = result.scene.elements.find((e) => e.type === "tube");
  assert.ok(road.points.every((p) => p.z < 0 && p.y < 3));
});

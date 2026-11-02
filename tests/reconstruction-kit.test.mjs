import test from "node:test";
import assert from "node:assert/strict";
import { validateScene } from "../server/core.mjs";
import { reconstructionDirection } from "../server/production.mjs";
const scene = (reconstruction) => ({
  elements: [{ id: "assembly", type: "reconstruction3d", reconstruction }],
});
test("reconstruction options survive validation and unsupported code/oversized geometry is rejected", () => {
  const value = {
    kind: "cabin",
    options: { rows: 12, cutaway: true, pitch: 0.8 },
  };
  assert.deepEqual(
    validateScene(scene(value)).elements[0].reconstruction,
    value,
  );
  assert.throws(() => validateScene(scene(undefined)), /requires/);
  assert.throws(() =>
    validateScene(scene({ kind: "forest", options: { count: 999999 } })),
  );
  assert.throws(() =>
    validateScene(scene({ kind: "room", options: { execute: "fetch(...)" } })),
  );
  assert.throws(
    () => validateScene(scene({ kind: "train", options: {} })),
    /requires researched/,
  );
  assert.throws(
    () =>
      validateScene(scene({ kind: "forest", options: { rMin: 20, rMax: 10 } })),
    /rMax/,
  );
  assert.throws(
    () =>
      validateScene(
        scene({
          kind: "coaster",
          options: {
            points: [
              [0, 0, 0],
              [0, 0, 0],
              [1, 0, 0],
              [2, 0, 0],
            ],
          },
        }),
      ),
    /distinct/,
  );
  assert.throws(() =>
    validateScene(scene({ kind: "worldMap", options: { center: [200, 0] } })),
  );
});
test("shot lighting, evidence and source text persist; clay direction overrides exterior defaults", () => {
  const input = {
    ...scene({ kind: "cockpit", options: { cutaway: true } }),
    reconstructionLook: "clay",
    footnote: "Positions approximate · source: supplied report",
    timeChip: "08:21",
  };
  const result = validateScene(input);
  assert.equal(result.footnote, input.footnote);
  assert.equal(result.reconstructionLook, "clay");
  const direction = reconstructionDirection({
    style: "3d",
    look: "White clay",
  });
  assert.match(direction, /Off-white matte cutaway/);
  assert.doesNotMatch(direction, /Use colored real materials/);
});
test("documentary cards require sources and valid data/highlighted quotes", () => {
  const base = scene({ kind: "room", options: {} });
  assert.throws(() =>
    validateScene({ ...base, evidence: { kind: "quote", text: "A claim" } }),
  );
  assert.throws(
    () =>
      validateScene({
        ...base,
        evidence: {
          kind: "chart",
          source: "Data",
          points: [
            [1, 3],
            [0, 2],
          ],
        },
      }),
    /increasing/,
  );
  assert.throws(
    () =>
      validateScene({
        ...base,
        evidence: {
          kind: "article",
          source: "Report",
          text: "The report.",
          highlights: [{ phrase: "invented", at: 0 }],
        },
      }),
    /verbatim/,
  );
});

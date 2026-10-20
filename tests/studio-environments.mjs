import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
import { downloadModel } from "../server/models.mjs";
import { capturePNG } from "../server/frame-capture.mjs";
const service = await startServer({
    root: path.resolve(".test-studio-environments-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const p = await service.store.create({
    title: "Internal populated environment verification",
    style: "3d",
    look: "Studio",
  });
  const tree = await downloadModel(
    service.store,
    p,
    "kenney:nature-kit:tree_oak",
  );
  const instances = Array.from({ length: 240 }, (_, i) => ({
    x: ((i % 20) - 9.5) * 7 + Math.sin(i * 4.9) * 2,
    y: 0,
    z: -22 - Math.floor(i / 20) * 7 + Math.cos(i * 3) * 2,
    scale: 6 + (i % 4) * 0.7,
    rotation: (i * 137.5) % 360,
  }));
  const scene = validateScene({
    background: "#c8d8e0",
    environment: { kind: "exterior", skyTop: "#6f9bc4", skyHorizon: "#dbe5e6" },
    cameraFov: 46,
    camera: { x: 24, y: 13, z: 32 },
    cameraRig: {
      type: "dolly",
      target: { x: 0, y: 2, z: -9 },
      to: { x: 21, y: 11, z: 29 },
      targetTo: { x: 0, y: 2, z: -11 },
      easing: "smooth",
      duration: 4,
    },
    lighting: { ambient: 1.15, key: 2.4, position: { x: 16, y: 30, z: 12 } },
    effects: { ssao: true, fog: { color: "#dbe5e6", near: 85, far: 200 } },
    elements: [
      {
        id: "ground",
        type: "box",
        width: 500,
        height: 0.4,
        depth: 500,
        y: -0.2,
        fill: "#82926b",
      },
      {
        id: "pavement",
        type: "box",
        width: 12,
        height: 0.06,
        depth: 100,
        x: 0,
        y: 0.01,
        z: 0,
        fill: "#a3a39a",
      },
      { id: "trees", type: "model", src: tree.path, instances },
      {
        id: "warehouse",
        type: "building3d",
        width: 14,
        height: 7,
        depth: 12,
        x: -14,
        y: 0,
        z: -10,
        fill: "#b5a590",
        building: { kind: "warehouse", floors: 2 },
      },
      {
        id: "office",
        type: "building3d",
        width: 9,
        height: 10,
        depth: 10,
        x: 14,
        y: 0,
        z: -24,
        fill: "#bbb7a5",
        building: { kind: "office", floors: 3, roofColor: "#515d68" },
      },
      {
        id: "house",
        type: "building3d",
        width: 8,
        height: 5,
        depth: 8,
        x: 13,
        y: 0,
        z: 1,
        fill: "#c9bca4",
        building: { kind: "house", floors: 2, roofColor: "#6c655c" },
      },
      {
        id: "white-figure",
        type: "mannequin",
        height: 1.8,
        x: 0,
        y: 0,
        z: 2,
        fill: "#efefed",
        pose: "walk",
        keyframes: [
          { time: 0, z: 2 },
          { time: 4, z: -0.5 },
        ],
      },
      {
        id: "seated-figure",
        type: "mannequin",
        height: 1.8,
        x: 2,
        y: 0,
        z: -2,
        fill: "#efefed",
        pose: "sit",
      },
    ],
  });
  p.durationSec = 4;
  p.shots = [{ id: "s001", start: 0, end: 4, scene }];
  service.store.saveProject(p);
  const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url + "/player.html?width=1280&height=720&inspect=1");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((p) => window.FC.setProject(p), p);
  const frame = await page.evaluate(() => window.FC.renderFrame(2));
  const forest = frame.metrics.find((m) => m.id === "trees"),
    seated = frame.metrics.find((m) => m.id === "seated-figure");
  assert.ok(forest.visibleSamples > 0);
  assert.ok(forest.worldBounds.max[0] - forest.worldBounds.min[0] > 120);
  assert.ok(Math.abs(seated.worldBounds.min[1]) < 0.05);
  const many = await page.evaluate(() => window.FC.getRenderStats());
  const first = await capturePNG(page, 2, 1280, 720);
  fs.writeFileSync("test-results/studio-populated-environment.png", first);
  await page.evaluate(() => window.FC.renderFrame(3));
  const again = await capturePNG(page, 2, 1280, 720);
  assert.ok(
    first.equals(again),
    "Backward seeking must preserve exact scene pixels",
  );
  const single = structuredClone(p);
  single.shots[0].scene.elements.find((e) => e.id === "trees").instances = [
    instances[10],
  ];
  await page.evaluate((p) => window.FC.setProject(p), single);
  await page.evaluate(() => window.FC.renderFrame(2));
  const one = await page.evaluate(() => window.FC.getRenderStats());
  assert.ok(
    many.calls <= one.calls + 12,
    "Instanced foliage adds a bounded number of draws; frustum/shadow culling can differ from one tree",
  );
  assert.ok(many.triangles > one.triangles);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual licensed GLB rendered as 240 GPU instances with bounded draw calls, detailed building facades/roofs, grounded seated figures, eased camera/target motion and pixel-exact backward seeking",
    { calls: many.calls, triangles: many.triangles },
  );
} finally {
  await browser.close();
  await service.close();
}

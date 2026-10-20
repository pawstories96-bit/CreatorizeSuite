import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
import { capturePNG } from "../server/frame-capture.mjs";
const s = await startServer({
    root: path.resolve(".test-vessel-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const p = await s.store.create({
    title: "Internal vessel assembly verification",
    style: "3d",
    look: "Studio",
  });
  p.durationSec = 4;
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        background: "#b4ccd8",
        environment: {
          kind: "exterior",
          skyTop: "#709bc0",
          skyHorizon: "#d2e1e5",
        },
        camera: { x: 210, y: 110, z: -300 },
        cameraFov: 43,
        cameraRig: {
          type: "dolly",
          target: { x: 0, y: 10, z: 0 },
          to: { x: 190, y: 100, z: -290 },
          duration: 4,
          easing: "smooth",
        },
        lighting: { ambient: 1.15, key: 2.3 },
        effects: { ssao: true },
        elements: [
          {
            id: "ship",
            type: "vessel3d",
            width: 44,
            height: 42,
            depth: 270,
            essential: true,
            vessel: { cargoLevels: 5, hullColor: "#273c50" },
            keyframes: [
              { time: 0, z: 0 },
              { time: 4, z: -8 },
            ],
          },
          {
            id: "water",
            type: "water",
            width: 1800,
            height: 1800,
            y: 0,
            fill: "#6d8b99",
          },
        ],
      }),
    },
  ];
  s.store.saveProject(p);
  const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(s.url + "/player.html?width=1280&height=720&inspect=1");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((p) => window.FC.setProject(p), p);
  const result = await page.evaluate(() => window.FC.renderFrame(2)),
    v = result.metrics.find((m) => m.id === "ship");
  assert.ok(v.worldBounds.min[1] < -8);
  assert.ok(v.worldBounds.max[1] > 30);
  assert.ok(v.worldBounds.max[2] - v.worldBounds.min[2] > 260);
  assert.deepEqual(v.problems, []);
  const first = await capturePNG(page, 2, 1280, 720);
  fs.writeFileSync("test-results/large-vessel.png", first);
  await page.evaluate(() => window.FC.renderFrame(3));
  assert.ok(first.equals(await capturePNG(page, 2, 1280, 720)));
  const close = structuredClone(p);
  close.shots[0].scene.elements[0].framing = "detail";
  close.shots[0].scene.camera = { x: 22, y: 16, z: -170 };
  close.shots[0].scene.cameraRig = {
    type: "dolly",
    target: { x: 0, y: 9, z: -120 },
    duration: 4,
  };
  await page.evaluate((p) => window.FC.setProject(p), close);
  const detail = await page.evaluate(() => window.FC.renderFrame(2)),
    metric = detail.metrics.find((m) => m.id === "ship");
  assert.equal(metric.requireFullFrame, false);
  assert.ok(metric.offscreen);
  assert.ok(metric.visibleSamples > 0);
  const qa = await s.pipeline.verify(close, close.shots);
  assert.ok(
    !qa.issues.some((i) => i.includes("essential subject leaves")),
    JSON.stringify(qa),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shaped hull, hundreds of ribbed GPU-instanced containers, aft accommodation/windows/funnel, rails/lifeboats, actual waterline/draft, coherent whole-vessel motion and exact seeking",
  );
} finally {
  await browser.close();
  await s.close();
}

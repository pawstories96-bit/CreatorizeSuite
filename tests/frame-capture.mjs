import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
import { capturePNG } from "../server/frame-capture.mjs";
const service = await startServer({
    root: path.resolve(".test-frame-capture-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const p = await service.store.create({
    title: "Internal frame equivalence",
    style: "3d",
  });
  p.durationSec = 4;
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        camera: { x: 8, y: 6, z: 11 },
        effects: { ssao: false },
        elements: [
          {
            id: "box",
            type: "box",
            width: 2,
            height: 2,
            depth: 2,
            fill: "#98725c",
          },
          {
            id: "text",
            type: "text",
            x: 640,
            y: 100,
            text: "Exact composite",
            width: 800,
            height: 90,
            fontSize: 45,
          },
        ],
      }),
    },
  ];
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(service.url + "/player.html?width=1280&height=720");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((p) => window.FC.setProject(p), p);
  let direct = PNG.sync.read(await capturePNG(page, 1, 1280, 720)),
    screenshot = PNG.sync.read(await page.screenshot());
  assert.deepEqual(direct.data, screenshot.data);
  const screenshotStart = Date.now();
  for (let i = 0; i < 8; i++) {
    await page.evaluate((t) => window.FC.renderFrame(t), i / 10);
    await page.screenshot();
  }
  const screenshotMs = Date.now() - screenshotStart;
  const directStart = Date.now();
  for (let i = 0; i < 8; i++) await capturePNG(page, i / 10, 1280, 720);
  const directMs = Date.now() - directStart;
  p.style = "pixel";
  p.baseStyle = "pixel";
  p.shots[0].scene = validateScene({
    background: "#204442",
    elements: [
      {
        id: "pixel",
        type: "rect",
        x: 500,
        y: 300,
        width: 201,
        height: 200,
        fill: "#c6a562",
      },
    ],
  });
  await page.evaluate((p) => window.FC.setProject(p), p);
  direct = PNG.sync.read(await capturePNG(page, 1, 1280, 720));
  assert.deepEqual(direct.data, PNG.sync.read(await page.screenshot()).data);
  assert.equal(direct.width, 1280);
  assert.equal(direct.height, 720);
  assert.deepEqual(
    [
      ...direct.data.subarray(
        (300 * 1280 + 500) * 4,
        (300 * 1280 + 500) * 4 + 4,
      ),
    ],
    [
      ...direct.data.subarray(
        (301 * 1280 + 501) * 4,
        (301 * 1280 + 501) * 4 + 4,
      ),
    ],
  );
  console.log(
    "PASS: direct export is pixel-identical to the displayed 3D/text composite and preserves nearest-neighbor pixel scaling",
    JSON.stringify({ screenshotMs, directMs }),
  );
} finally {
  await browser.close();
  await service.close();
}

import { startServer } from "../server/index.mjs";
import { uid, atomic, run, validateScene } from "../server/core.mjs";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const service = await startServer({
  root: path.resolve(".test-media-" + uid()),
  port: 0,
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  const p = await service.store.create({
      title: "Internal media verification",
    }),
    dir = service.store.projectDir(p.id);
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=10",
    "-t",
    "2",
    "-pix_fmt",
    "yuv420p",
    path.join(dir, "assets", "motion.mp4"),
  ]);
  const positions = Buffer.from(
    new Float32Array([-3, 0, 0, 3, 0, 0, 0, 5, 0]).buffer,
  );
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 0.8, 0, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        doubleSided: true,
      },
    ],
    buffers: [{ byteLength: positions.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-3, 0, 0],
        max: [3, 5, 0],
      },
    ],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(12),
    jh = Buffer.alloc(8),
    bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + positions.length, 8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(positions.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  atomic(
    path.join(dir, "assets", "shape.glb"),
    Buffer.concat([header, jh, json, bh, positions]),
  );
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 2,
      scene: validateScene({
        background: "#111111",
        camera: { x: 0, y: 2, z: 16 },
        elements: [
          {
            id: "film",
            type: "video",
            src: "assets/motion.mp4",
            x: 350,
            y: 360,
            width: 600,
            height: 340,
          },
          {
            id: "triangle",
            type: "model",
            src: "assets/shape.glb",
            x: 3,
            y: 0,
            z: 0,
            scale: 0.8,
          },
        ],
      }),
    },
  ];
  p.durationSec = 2;
  service.store.saveProject(p);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url + "/player.html?project=" + p.id);
  await page.waitForFunction(() => window.ready);
  const hash = async (t) => {
    await page.evaluate((t) => window.FC.renderFrame(t), t);
    return crypto
      .createHash("sha256")
      .update(await page.screenshot())
      .digest("hex");
  };
  const first = await hash(0.3),
    second = await hash(1.2),
    again = await hash(0.3);
  assert.notEqual(first, second);
  assert.equal(first, again);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/media.png" });
  console.log(
    "PASS: actual GLB import, MP4 frames and deterministic backward seeking",
  );
  await page.goto(service.url);
  await page
    .locator(".sidebar")
    .getByTitle("Thumbnails", { exact: true })
    .click();
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await page
    .getByPlaceholder("Describe the thumbnail. Connect images as references.")
    .fill("Remember this prompt");
  await page.getByRole("button", { name: "Save canvas", exact: true }).click();
  await page.getByText("Canvas saved", { exact: true }).waitFor();
  await page.reload();
  await page
    .locator(".sidebar")
    .getByTitle("Thumbnails", { exact: true })
    .click();
  assert.equal(
    await page
      .getByPlaceholder("Describe the thumbnail. Connect images as references.")
      .inputValue(),
    "Remember this prompt",
  );
  console.log("PASS: thumbnail canvas edits survive reload");
  await page.screenshot({ path: "test-results/thumbnail-canvas.png" });
  atomic("test-results/media-results.json", {
    passed: true,
    checkedAt: new Date().toISOString(),
  });
} finally {
  await browser.close();
  await service.close();
}

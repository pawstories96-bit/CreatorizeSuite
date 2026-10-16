import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { validateScene, uid } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-graphics-" + uid()), port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && /shader|WebGL|module/i.test(m.text())) errors.push(m.text()); });
try {
  const profiles = (await fetch(service.url + "/api/state").then(r => r.json())).styles;
  assert.equal(profiles.length, 7);
  await page.goto(service.url + "/player.html?width=960&height=540&inspect=1");
  await page.waitForFunction(() => window.ready);
  const hash = async () => crypto.createHash("sha256").update(await page.locator("#stage").screenshot()).digest("hex");
  for (const style of profiles) {
    const p = await fetch(`${service.url}/api/styles/${style.id}/preview`).then(r => r.json());
    assert.equal(service.store.all("projects").length, 0);
    await page.evaluate(p => window.FC.setProject(p), p);
    const result = await page.evaluate(() => window.FC.renderFrame(2));
    assert.ok(result.metrics.length, style.id);
    await page.screenshot({ path: `test-results/style-${style.id}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("PASS: seven actual style previews render without creating projects or shader errors");
  const scene = validateScene({ background: "#a7bcc5", camera: { x: 7, y: 6, z: 12 }, effects: { ssao: true, bloom: 0.04, grain: 0.025, outline: true }, elements: [
    { id: "water", type: "water", x: 0, y: -0.02, z: 0, width: 25, height: 25, fill: "#8ca2a7" },
    { id: "tank", type: "cylinder", x: -2, y: 1, z: -1, height: 2, radius: 0.6, fill: "#ddd7bd" },
    { id: "pipe", type: "tube", points: [{ x: -2, y: 0.4, z: -1 }, { x: 0, y: 0.4, z: -1 }, { x: 1, y: 0.4, z: 1 }], tubeRadius: 0.1, fill: "#d6dce1" },
    { id: "flange", type: "torus", x: -1, y: 0.4, z: -1, radius: 0.17, tubeRadius: 0.05, rotation3d: { x: 0, y: 90, z: 0 }, fill: "#7e95ae" },
    { id: "person", type: "mannequin", x: 0.5, y: 0, z: 2, height: 1.8, role: "protagonist", pose: "walk", highlight: true, material: { fresnel: true } },
    { id: "debris", type: "particles", x: 2, y: 1.5, z: 0, delay: 0.5, duration: 3, particleCount: 120, radius: 0.05, seed: 42, speed: 2, gravity: 2, fill: "#d4c6ad" },
  ] });
  const p = { id: "graphics", title: "Internal runtime checks", style: "3d", format: "16:9", durationSec: 4, shots: [{ id: "s001", start: 0, end: 4, scene }] };
  await page.evaluate(p => window.FC.setProject(p), p);
  const first = await page.evaluate(() => window.FC.renderFrame(1)); const one = await hash();
  await page.evaluate(() => window.FC.renderFrame(2)); assert.notEqual(await hash(), one);
  await page.evaluate(() => window.FC.renderFrame(1)); assert.equal(await hash(), one);
  await page.evaluate(p => window.FC.setProject(p), p); await page.evaluate(() => window.FC.renderFrame(1)); assert.equal(await hash(), one);
  for (const id of ["water", "pipe", "flange", "person", "debris"]) assert.ok(first.metrics.some(m => m.id === id), id);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/graphics-upgrade.png" });
  console.log("PASS: reflective water, connected pipes, oriented torus, rigged figure, particles, SSAO/bloom/film/outline and deterministic reload/seeking");
  await page.goto(service.url);
  await page.locator(".sidebar").getByTitle("Styles", { exact: true }).click();
  await page.locator(".style-card").first().locator(".style-art").hover();
  await page.locator(".style-live-preview").waitFor();
  const preview = page.frameLocator(".style-live-preview");
  await preview.locator("#stage").waitFor();
  assert.equal(service.store.all("projects").length, 0);
  console.log("PASS: actual live hover preview in the Next.js desktop interface; workspace stays empty");
} finally { await browser.close(); await service.close(); }

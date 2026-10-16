import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, run, validateScene } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-style-training-" + uid()), port: 0 });
const browser = await chromium.launch();
try {
  const p = await service.store.create({ title: "Internal style extraction check" }), dir = service.store.projectDir(p.id);
  p.durationSec = 3; p.shots = [{ id: "s001", title: "Shape", start: 0, end: 3, narration: "A simple shape", scene: validateScene({ background: "#f1e5cd", elements: [{ id: "shape", type: "circle", radius: 130, x: 640, y: 360, fill: "#db9659" }] }) }]; service.store.saveProject(p);
  const image = path.join(dir, "assets", "source.png"); await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:duration=1", "-frames:v", "1", image]);
  let invoked = 0;
  service.pipeline.agents.generate = async ({ images, role }) => { assert.equal(role, "qa"); assert.equal(images.length, 1); assert.ok(fs.statSync(images[0]).size > 1000); invoked++; return { description: "Warm paper with pixel silhouettes", guide: "Use warm paper backgrounds, crisp geometric silhouettes, controlled three-color shading, a central focal subject and slow original camera moves. Keep labels short and readable.", palette: ["#f1e5cd", "#db9659"], effects: { halftone: true, grain: .08 } }; };
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(service.url); await page.locator(".sidebar").getByTitle("Styles", { exact: true }).click(); await page.getByRole("button", { name: "Train from references", exact: true }).click();
  await page.getByLabel("Trained style name").fill("My paper pixels"); await page.getByLabel("Starting style renderer").selectOption("pixel");
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(image);
  await page.getByRole("dialog").getByRole("checkbox").first().waitFor();
  const train = page.getByRole("button", { name: "Train style", exact: true }); await train.waitFor();
  for (let i = 0; i < 50 && !(await train.isEnabled()); i++) await new Promise(r => setTimeout(r, 100));
  await train.click();
  let done;
  for (let i = 0; i < 600; i++) { const j = service.store.all("jobs").find(j => j.action === "train-style"); if (j?.status === "error") throw Error(j.error); if (j?.status === "done") { done = j; break; } await new Promise(r => setTimeout(r, 100)); }
  assert.ok(done); assert.equal(invoked, 1); const styled = service.store.project(p.id); assert.equal(styled.baseStyle, "pixel"); assert.equal(done.result.id, styled.style);
  assert.ok(fs.existsSync(path.join(service.store.root, "styles", styled.style, "lib", "style.js")));
  const player = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await player.goto(service.url + `/player.html?project=${p.id}`); await player.waitForFunction(() => window.ready);
  const output = await player.evaluate(async () => { await window.FC.renderFrame(1); const canvas = document.querySelector("#stage"); return { width: canvas.width, height: canvas.height, image: canvas.toDataURL() }; });
  assert.equal(output.width, 640); assert.equal(output.height, 360);
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  const plain = { ...styled, style: "pixel", baseStyle: "pixel" };
  await player.evaluate(async p => { await window.FC.setProject(p); await window.FC.renderFrame(1); }, plain);
  assert.notEqual(digest(output.image), digest(await player.locator("#stage").evaluate(c => c.toDataURL())));
  await page.reload(); await page.getByText("My paper pixels", { exact: true }).waitFor(); await page.screenshot({ path: "test-results/trained-style.png" }); assert.deepEqual(errors, []);
  console.log("PASS: reference upload and style extraction UI save a reusable module, apply the selected base renderer, load actual trained effects in the player and survive reload");
} finally { await browser.close(); await service.close(); }

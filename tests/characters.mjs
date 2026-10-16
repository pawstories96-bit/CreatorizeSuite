import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-character-ui-" + uid()), port: 0 });
const browser = await chromium.launch();
try {
  const p = await service.store.create({ title: "Internal character rig check", style: "flat" });
  p.durationSec = 4; p.shots = [{ id: "s001", title: "Character shot", start: 0, end: 4, narration: "A researcher walks", scene: validateScene({ background: "#e5e7d9", elements: [{ id: "ground", type: "rect", x: 640, y: 640, width: 1000, height: 30, fill: "#597769" }] }) }]; service.store.saveProject(p);
  service.pipeline.agents.generate = async ({ role }) => { assert.equal(role, "character"); return { name: "Curly researcher", element: { id: "researcher", type: "character2d", width: 260, height: 350, pose: "idle", expression: "happy", rig2d: { skin: "#dba87f", hair: "#28333e", shirt: "#d9ad43", trousers: "#273f58", shoes: "#202c35", outline: "#20303a", hairStyle: "curly", accessory: "glasses", silhouette: "human" } } }; };
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(service.url); await page.getByText(p.title, { exact: true }).first().click(); await page.getByTitle("Build a rigged character", { exact: true }).click();
  await page.getByLabel("Character description").fill("A friendly researcher with glasses and a mustard shirt"); await page.getByRole("button", { name: "Design character", exact: true }).click();
  await page.getByLabel("Saved character", { exact: true }).waitFor({ timeout: 60000 }); await page.getByLabel("Character preview pose").selectOption("walk");
  await page.frameLocator(".character-preview").locator("#stage").waitFor(); await page.screenshot({ path: "test-results/character-builder.png" });
  await page.getByRole("button", { name: "Insert into current shot", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  const updated = service.store.project(p.id), rig = updated.shots[0].scene.elements.find(e => e.type === "character2d"); assert.ok(rig); assert.equal(updated.shots[0].scene.elements[0].id, "ground");
  const player = await browser.newPage(); await player.goto(service.url + "/player.html?width=1280&height=720"); await player.waitForFunction(() => window.ready);
  rig.pose = "walk"; await player.evaluate(p => window.FC.setProject(p), updated);
  const hash = async t => { await player.evaluate(t => window.FC.renderFrame(t), t); return crypto.createHash("sha256").update(await player.locator("#stage").screenshot()).digest("hex"); };
  const first = await hash(.5); assert.notEqual(first, await hash(1.3)); assert.equal(first, await hash(.5));
  const metrics = await player.evaluate(() => window.FC.renderFrame(.5)); assert.ok(metrics.metrics.find(m => m.id === rig.id)?.bounds);
  await page.reload(); assert.equal(service.store.all("characters").length, 1); assert.equal(service.store.all("projects").length, 1); assert.deepEqual(errors, []);
  console.log("PASS: prompt-designed rig, actual idle/pose preview, insertion preserves the shot, articulated walk changes frames deterministically and character library survives reload");
} finally { await browser.close(); await service.close(); }

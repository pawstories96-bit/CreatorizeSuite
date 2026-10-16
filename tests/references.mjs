import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, run } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-references-" + uid()), port: 0 });
const browser = await chromium.launch();
const call = async (url, method = "GET", body) => { const r = await fetch(service.url + "/api" + url, { method, headers: { Origin: service.url, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok) throw Error(data.error); return data; };
const wait = async id => { for (let i = 0; i < 600; i++) { const j = service.store.get("jobs", id); if (["done", "error"].includes(j.status)) return j; await new Promise(r => setTimeout(r, 100)); } throw Error("Job timeout"); };
try {
  const p = await service.store.create({ title: "Internal reference and scripting check", script: "Existing narration stays safe." });
  const video = path.join(service.store.root, "reference.mp4");
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
  service.pipeline.agents.generate = async ({ role, images, prompt }) => {
    if (role === "qa") { assert.equal(images.length, 3); for (const image of images) assert.ok(fs.statSync(image).size > 1000); return { composition: "Offset focal subject", camera: "Frame differences suggest a lateral move", lighting: "Soft key", materials: "Matte", motion: "Changing details", implementation: "Use a camera orbit with an easing curve", uncertainties: ["Three stills do not establish exact camera velocity"] }; }
    if (role === "research") return { research: "Source review", framing: "A sourced story", unverified: [], script: "A clear story." };
    assert.match(prompt, /custom hook method|Enforced script rules/); return { script: "AI writes a very long sentence with forbidden words and no required phrase." };
  };
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(service.url); await page.getByText(p.title, { exact: true }).first().click();
  await page.getByRole("button", { name: "Pick parts", exact: true }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(video);
  await page.getByLabel("Reference In", { exact: true }).waitFor();
  await page.getByLabel("Reference In", { exact: true }).fill("0.5"); await page.getByLabel("Reference Out", { exact: true }).fill("2.5");
  await page.getByLabel("Technique name").fill("Evidence board sweep");
  await page.getByRole("button", { name: "Save and analyze selected frames" }).click();
  let analysis; for (let i = 0; i < 100; i++) { analysis = service.store.all("jobs").find(j => j.action === "analyze-reference"); if (analysis) break; await new Promise(r => setTimeout(r, 100)); }
  assert.equal((await wait(analysis.id)).status, "done");
  const ref = service.store.project(p.id).references[0]; assert.equal(ref.start, .5); assert.equal(ref.end, 2.5); assert.equal(ref.fps, 24); assert.equal(ref.frames.length, 3); assert.ok(ref.analysis.implementation.includes("orbit"));
  const hashes = ref.frames.map(f => fs.readFileSync(path.join(service.store.projectDir(p.id), f.path)).toString("base64")); assert.notEqual(hashes[0], hashes[2]);
  await page.getByRole("button", { name: "Pick parts", exact: true }).click(); await page.getByText("Evidence board sweep", { exact: true }).waitFor(); await page.screenshot({ path: "test-results/reference-picker.png" });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  const skill = new FormData(); skill.append("file", new Blob(["Use the custom hook method: start with a concrete mystery."]), "my-script.md");
  await call(`/projects/${p.id}/scripting-skill`, "POST", skill);
  await call(`/projects/${p.id}/script-settings`, "POST", { mode: "deep", banned: ["AI"], required: ["clear story"], maxSentenceWords: 8 });
  const script = await wait((await call(`/projects/${p.id}/jobs`, "POST", { action: "script" })).id);
  assert.equal(script.status, "error"); assert.match(script.error, /Script rules failed/); assert.equal(service.store.project(p.id).script, p.script);
  assert.ok(fs.existsSync(path.join(service.store.projectDir(p.id), "exports", `script-needs-review-${script.id}.txt`)));
  await assert.rejects(call(`/projects/${p.id}/references`, "POST", { path: "../reference.mp4", label: "bad" }), /outside|asset|path/i);
  assert.deepEqual(errors, []);
  console.log("PASS: actual reference upload, 24fps In/Out UI, selected-frame extraction and saved analysis; custom scripting skill and enforced rules preserve existing narration on failure");
} finally { await browser.close(); await service.close(); }

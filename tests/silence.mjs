import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, run, validateScene } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-silence-ui-" + uid()), port: 0 });
const browser = await chromium.launch({ headless: true });
try {
  const p = await service.store.create({ title: "Internal pause interface check" }), dir = service.store.projectDir(p.id);
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "aevalsrc=exprs='if(between(t,0,0.7)+between(t,1.9,2.6)+between(t,3.5,4.2),0.2*sin(2*PI*440*t),0)':s=48000:d=4.2", "-ac", "1", path.join(dir, "audio", "source.wav")]);
  p.audio = "audio/source.wav"; p.durationSec = 4.2; p.words = [{ w: "One", start: 0.02, end: 0.68 }, { w: "Two", start: 1.92, end: 2.58 }, { w: "Three", start: 3.52, end: 4.18 }];
  p.shots = [{ id: "s001", title: "Recording", start: 0, end: 4.2, scene: validateScene({ elements: [{ id: "circle", type: "circle", x: 640, y: 360, radius: 100 }] }) }];
  service.store.saveProject(p);
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  await page.goto(service.url); await page.getByText(p.title, { exact: true }).first().click();
  await page.getByRole("button", { name: "Trim pauses", exact: true }).click();
  await page.getByText(/2 of 2 pauses selected/).waitFor();
  await page.getByRole("slider", { name: "Pause reduction" }).fill("75");
  await page.screenshot({ path: "test-results/silence-trimmer.png" });
  await page.getByRole("button", { name: "Apply pause reduction" }).click();
  let done;
  for (let i = 0; i < 300; i++) { const job = service.store.all("jobs").find(j => j.action === "trim"); if (job?.status === "error") throw Error(job.error); if (job?.status === "done") { done = job; break; } await new Promise(r => setTimeout(r, 100)); }
  assert.ok(done?.commit); assert.ok(service.store.project(p.id).durationSec < 3);
  assert.equal(service.store.project(p.id).words.length, 3);
  console.log("PASS: actual pause analysis appears on the waveform, percentage control queues a durable trim, and retimed media is committed");
} finally { await browser.close(); await service.close(); }

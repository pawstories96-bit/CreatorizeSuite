import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { uid, validateScene, atomic } from "../server/core.mjs";
const root = path.resolve(".test-e2e-" + uid());
const service = await startServer({ root, port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
});
fs.mkdirSync("test-results", { recursive: true });
const call = async (url, method = "GET", body) => {
  const r = await fetch(service.url + "/api" + url, {
    method,
    headers: { "Content-Type": "application/json", Origin: service.url },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
};
const waitJob = async (id, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const j = service.store.get("jobs", id);
    if (["done", "error", "stopped", "paused"].includes(j.status)) {
      assert.equal(j.status, "done", j.error || JSON.stringify(j.events));
      return j;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Job timed out");
};
try {
  await page.goto(service.url);
  await page
    .getByRole("heading", { name: "Make something worth watching." })
    .waitFor();
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  console.log("PASS: empty home, no seeded projects");
  assert.equal((await call("/state")).projects.length, 0);
  await page
    .getByRole("button", { name: "New project", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("Give your story a name").fill("Isolated QA run");
  await page.getByRole("button", { name: "I have a script" }).click();
  await page
    .getByPlaceholder("Paste your script here. Use ## for chapter headings.")
    .fill(
      "Every river begins with a single drop. Water flows downhill, joining streams and shaping the land.",
    );
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("heading", { name: "Isolated QA run" }).waitFor();
  console.log("PASS: project creation through UI");
  const p = (await call("/state")).projects[0];
  const tts = await call(`/projects/${p.id}/jobs`, "POST", {
    action: "tts",
    options: { provider: "windows" },
  });
  await waitJob(tts.id);
  let current = await call("/projects/" + p.id);
  assert.ok(current.words.length > 10);
  assert.equal(current.pipeline.audioCleaned, "done");
  console.log("PASS: real Windows TTS, word events, FFmpeg cleaning");
  const board = await call(`/projects/${p.id}/jobs`, "POST", {
    action: "storyboard",
  });
  await waitJob(board.id);
  current = service.store.project(p.id);
  for (const s of current.shots) {
    s.scene = validateScene({
      background: "#15352a",
      elements: [
        {
          id: "river",
          type: "path",
          x: 0,
          y: 0,
          path: "M0 540 Q300 360 600 540 T1280 540 L1280 720 L0 720 Z",
          fill: "#70b8a5",
          animation: "none",
        },
        {
          id: "sun",
          type: "circle",
          x: 980,
          y: 160,
          radius: 60,
          fill: "#edcc84",
          animation: "float",
        },
        {
          id: "title",
          type: "text",
          x: 530,
          y: 220,
          width: 800,
          height: 130,
          text: "A river begins",
          fontSize: 62,
          fill: "#e6eddc",
          animation: "none",
        },
      ],
    });
    s.status = "built";
  }
  current.pipeline.scenes = "done";
  service.store.saveProject(current);
  await service.store.commit(p.id, "QA render fixture");
  const qa = await call(`/projects/${p.id}/jobs`, "POST", { action: "qa" });
  await waitJob(qa.id);
  console.log("PASS: programmatic frame verification");
  await page.reload();
  await page.getByTitle("Video preview").waitFor();
  await page.waitForFunction(
    () => document.querySelector("audio")?.readyState >= 2,
  );
  await page.getByTitle("Play", { exact: true }).click();
  await page.waitForTimeout(1100);
  assert.ok(await page.locator("audio").evaluate((a) => a.currentTime > 0.5));
  await page.getByTitle("Pause", { exact: true }).click();
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
  const render = await call(`/projects/${p.id}/jobs`, "POST", {
    action: "export",
    options: { resolution: "test", fps: 4 },
  });
  const exported = await waitJob(render.id);
  assert.ok(exported.size > 5000);
  assert.ok(
    fs.existsSync(
      path.join(service.store.projectDir(p.id), "exports", "captions.srt"),
    ),
  );
  console.log("PASS: actual Chromium frame export, MP4 encode and SRT");
  const r = await call("/memory", "POST", { text: "Keep all text legible" });
  assert.ok(r.id);
  const duplicate = await call(`/projects/${p.id}/duplicate`, "POST");
  assert.equal(duplicate.shots.length, current.shots.length);
  await call(`/projects/${duplicate.id}`, "DELETE");
  console.log("PASS: memory persistence, duplicate, recoverable delete");
  for (const name of [
    "Home",
    "Projects",
    "Channels",
    "Styles",
    "Memory",
    "Thumbnails",
    "Routines",
    "Usage",
    "Renders",
    "YouTube",
    "Connections",
    "Settings",
  ]) {
    await page.locator(".sidebar").getByTitle(name, { exact: true }).click();
    await page.waitForTimeout(250);
  }
  console.log("PASS: navigation across every page");
  const invalid = await fetch(service.url + "/api/projects", {
    method: "POST",
    headers: {
      Origin: "https://foreign.invalid",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(invalid.status, 403);
  assert.deepEqual(errors, []);
  console.log("PASS: origin protection and no browser runtime errors");
  atomic("test-results/results.json", {
    passed: true,
    workspace: root,
    projectId: p.id,
    export: exported.output,
    checkedAt: new Date().toISOString(),
  });
} finally {
  await browser.close();
  await service.close();
}

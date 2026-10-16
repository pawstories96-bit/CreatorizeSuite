import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene, atomic } from "../server/core.mjs";
const service = await startServer({
  root: path.resolve(".test-editing-" + uid()),
  port: 0,
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const wait = async (id) => {
  for (let i = 0; i < 300; i++) {
    const job = service.store.get("jobs", id);
    if (["done", "error"].includes(job.status)) {
      assert.equal(job.status, "done", job.error);
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("Edit timed out");
};
try {
  const p = await service.store.create({ title: "Internal edit verification" });
  const scene = validateScene({
    background: "#101820",
    elements: [
      {
        id: "target",
        type: "circle",
        x: 420,
        y: 360,
        radius: 100,
        fill: "#ffcc00",
      },
      {
        id: "neighbor",
        type: "rect",
        x: 850,
        y: 360,
        width: 180,
        height: 180,
        fill: "#4488ee",
      },
    ],
  });
  p.durationSec = 6;
  p.shots = [0, 1, 2].map((i) => ({
    id: `s00${i + 1}`,
    title: `Shot ${i + 1}`,
    start: i * 2,
    end: i * 2 + 2,
    narration: "Two shapes",
    status: "built",
    scene: structuredClone(scene),
  }));
  service.store.saveProject(p);
  // Deliberately overbroad model output verifies server-enforced edit boundaries.
  service.pipeline.agents.generate = async () =>
    validateScene({
      background: "#ffffff",
      elements: scene.elements.map((e) => ({ ...e, fill: "#ee4488" })),
    });
  const edit = await wait(
    service.pipeline.enqueue(p.id, "edit", {
      scope: "selection",
      shotId: "s001",
      elementId: "target",
      prompt: "Change the circle color",
    }).id,
  );
  const after = service.store.project(p.id);
  assert.equal(after.shots[0].scene.background, scene.background);
  assert.deepEqual(after.shots[0].scene.elements[1], scene.elements[1]);
  assert.equal(after.shots[0].scene.elements[0].fill, "#ee4488");
  assert.deepEqual(after.shots[1].scene, scene);
  assert.equal(edit.comparisons.length, 1);
  const beforePNG = fs.readFileSync(
    path.join(service.store.projectDir(p.id), edit.comparisons[0].before),
  );
  const afterPNG = fs.readFileSync(
    path.join(service.store.projectDir(p.id), edit.comparisons[0].after),
  );
  assert.notDeepEqual(beforePNG, afterPNG);
  console.log(
    "PASS: selected-object boundary enforced despite overbroad output; actual before/after PNGs differ",
  );
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  await page.getByRole("heading", { name: p.title }).waitFor();
  const tracks = page.locator(".tracks");
  const bounds = await tracks.boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(bounds.x + bounds.width * 0.05, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + 10, {
    steps: 8,
  });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.getByText(/Editing 2 whole shots overlapping/).waitFor();
  await page.getByLabel("Edit instructions").fill("Change the shapes to pink");
  await page.getByTitle("Apply edit", { exact: true }).click();
  let rangeJob;
  for (let i = 0; i < 30; i++) {
    rangeJob = service.store
      .all("jobs")
      .find((j) => j.options.scope === "range");
    if (rangeJob) break;
    await page.waitForTimeout(100);
  }
  const ranged = await wait(rangeJob.id);
  assert.equal(ranged.comparisons.length, 2);
  assert.deepEqual(service.store.project(p.id).shots[2].scene, scene);
  await page
    .getByRole("button", { name: "Before / After", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Before / After", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Before / After", exact: true })
    .waitFor();
  const videos = page.locator(".comparison-pair video");
  assert.equal(await videos.count(), 4);
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".comparison-pair video")].every(
      (video) => video.readyState >= 1 && video.videoWidth > 0,
    ),
  );
  assert.ok(
    (await service.pipeline.duration(
      path.join(service.store.projectDir(p.id), edit.comparisons[0].beforeClip),
    )) > 1.5,
  );
  await page
    .getByRole("button", { name: "Play both motion previews" })
    .first()
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".comparison-pair video")]
      .slice(0, 2)
      .every((v) => v.currentTime > 0.1),
  );
  await page.screenshot({ path: "test-results/edit-comparison.png" });
  assert.deepEqual(errors, []);
  atomic("test-results/editing-results.json", {
    passed: true,
    selectionCommit: edit.commit,
    rangeCommit: ranged.commit,
    checkedAt: new Date().toISOString(),
  });
  console.log(
    "PASS: Shift-drag edits only overlapping shots; before/after MP4s decode and play together in the comparison panel",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  const sourceFile = path.join(
    service.store.projectDir(p.id),
    "scenes",
    "s003.json",
  );
  const changedScene = validateScene({
    ...scene,
    elements: scene.elements.map((e) => ({ ...e, fill: "#55cc88" })),
  });
  atomic(sourceFile, changedScene);
  service.sceneWatcher.scan();
  const reload = service.store.all("jobs").find((j) => j.action === "reload");
  await wait(reload.id);
  assert.deepEqual(service.store.project(p.id).shots[2].scene, changedScene);
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentWindow.FC?.getProject()?.shots[2]
        .scene.elements[0].fill === "#55cc88",
  );
  atomic(sourceFile, "{invalid json");
  service.sceneWatcher.scan();
  const failed = service.store
    .all("jobs")
    .find((j) => j.action === "reload" && j.id !== reload.id);
  for (
    let i = 0;
    i < 100 && service.store.get("jobs", failed.id).status !== "error";
    i++
  )
    await page.waitForTimeout(100);
  assert.equal(service.store.get("jobs", failed.id).status, "error");
  assert.deepEqual(service.store.project(p.id).shots[2].scene, changedScene);
  console.log(
    "PASS: external JSON edits hot-reload into the live player; invalid source preserves the last valid preview",
  );
} finally {
  await browser.close();
  await service.close();
}

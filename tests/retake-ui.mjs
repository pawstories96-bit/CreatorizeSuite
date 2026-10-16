import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, run, validateScene } from "../server/core.mjs";
const service = await startServer({
    root: path.resolve(".test-retake-ui-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
const wait = async (action) => {
  for (let i = 0; i < 400; i++) {
    const job = service.store.all("jobs").find((j) => j.action === action);
    if (job?.status === "done") return job;
    if (job?.status === "error") throw Error(job.error);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Take task timed out");
};
try {
  const p = await service.store.create({
      title: "Internal take review",
      style: "talking",
    }),
    dir = service.store.projectDir(p.id);
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=7.1:sample_rate=48000",
    path.join(dir, "audio", "source.wav"),
  ]);
  p.script =
    "The bridge was built sorry again The bridge was built in nineteen seventy seven";
  p.words = p.script
    .split(" ")
    .map((w, i) => ({ w, start: i * 0.5 + 0.05, end: i * 0.5 + 0.4 }));
  p.audio = "audio/source.wav";
  p.durationSec = 7.1;
  p.shots = [
    {
      id: "s001",
      title: "Take review",
      start: 0,
      end: 7.1,
      scene: validateScene({
        elements: [{ id: "shape", type: "circle", radius: 50 }],
      }),
    },
  ];
  service.store.saveProject(p);
  service.pipeline.agents.generate = async ({ role }) => {
    assert.equal(role, "script");
    return {
      takes: [
        {
          removeStart: 0,
          removeEnd: 5,
          keepStart: 6,
          keepEnd: 13,
          reason: "Earlier repeated start with a spoken correction",
        },
      ],
    };
  };
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  await page.getByRole("button", { name: "Review takes", exact: true }).click();
  await page
    .getByRole("button", { name: "Find repeated takes", exact: true })
    .click();
  await wait("analyze-takes");
  await page.getByRole("button", { name: "Listen to earlier take" }).waitFor();
  await page.getByRole("button", { name: "Listen to kept take" }).click();
  await page.waitForFunction(
    () => document.querySelector('[role="dialog"] audio')?.currentTime >= 2.9,
  );
  await page.getByRole("checkbox", { name: "Remove earlier take" }).uncheck();
  assert.equal(
    await page
      .getByRole("button", { name: "Apply selected take cuts" })
      .isDisabled(),
    true,
  );
  await page.getByRole("checkbox", { name: "Remove earlier take" }).check();
  await page.screenshot({ path: "test-results/retake-review.png" });
  await page.getByRole("button", { name: "Apply selected take cuts" }).click();
  await wait("apply-takes");
  const updated = service.store.project(p.id);
  assert.equal(updated.words.length, 8);
  assert.equal(
    updated.script,
    "The bridge was built in nineteen seventy seven",
  );
  assert.ok(updated.durationSec < 5);
  assert.ok(fs.existsSync(path.join(dir, "audio", "source.wav")));
  assert.equal(
    updated.cameraCuts,
    undefined,
    "Audio-only recordings do not invent camera tracks",
  );
  await page.getByRole("button", { name: "Review takes", exact: true }).click();
  await page
    .getByText(/This analysis belongs to an earlier recording/)
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: take-review UI proposes, auditions, deselects and applies real audio cuts; later words and original media survive, stale suggestions cannot be reapplied",
  );
} finally {
  await browser.close();
  await service.close();
}

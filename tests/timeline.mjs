import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, run, validateScene } from "../server/core.mjs";
import { validateTimeline, mixTimeline } from "../server/timeline.mjs";
process.env.PATH =
  path.resolve("resources/ffmpeg") + path.delimiter + process.env.PATH;
const service = await startServer({
    root: path.resolve(".test-timeline-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const p = await service.store.create({
      title: "Internal timeline verification",
    }),
    dir = service.store.projectDir(p.id);
  p.durationSec = 3;
  p.shots = [
    {
      id: "s1",
      start: 0,
      end: 3,
      scene: validateScene({
        background: "#102030",
        elements: [
          {
            id: "circle",
            type: "circle",
            x: 300,
            y: 300,
            radius: 70,
            fill: "#ffff00",
          },
        ],
      }),
    },
  ];
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=400:duration=3",
    path.join(dir, "audio/narration.wav"),
  ]);
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=200:duration=1",
    path.join(dir, "assets/tone.wav"),
  ]);
  p.audio = "audio/narration.wav";
  p.timeline = validateTimeline(
    {
      cues: [{ id: "cue", shotId: "s1", elementId: "circle", time: 1 }],
      cards: [{ id: "card", text: "Timed overlay", start: 1, end: 2 }],
      audio: [
        {
          id: "sound",
          track: "sfx",
          src: "assets/tone.wav",
          start: 1,
          end: 2,
          volumeDb: -20,
        },
      ],
    },
    p,
    dir,
  );
  service.store.saveProject(p);
  assert.throws(
    () =>
      validateTimeline(
        {
          ...p.timeline,
          audio: [{ ...p.timeline.audio[0], src: "../outside.wav" }],
        },
        p,
        dir,
      ),
    /imported audio/,
  );
  assert.throws(
    () =>
      validateTimeline(
        { ...p.timeline, cues: [{ ...p.timeline.cues[0], time: 4 }] },
        p,
        dir,
      ),
    /Cue time/,
  );
  const page = await browser.newPage();
  await page.goto(service.url + "/player.html");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((p) => window.FC.setProject(p), p);
  const metrics = async (t) =>
    page.evaluate((t) => window.FC.renderFrame(t), t);
  assert.equal(
    (await metrics(0.5)).metrics.find((m) => m.id === "circle").visible,
    false,
  );
  assert.equal(
    (await metrics(1.5)).metrics.find((m) => m.id === "circle").visible,
    true,
  );
  assert.ok((await metrics(1.5)).metrics.some((m) => m.id === "card-text"));
  assert.ok(!(await metrics(2.5)).metrics.some((m) => m.id === "card-text"));
  await mixTimeline(p, dir, {});
  assert.ok(fs.statSync(path.join(dir, p.mix)).size > 1000);
  assert.ok(p.mixReport.measurement.input_i);
  console.log(
    "PASS: timed cue visibility, card boundaries, imported audio trims/fades/ducking, real FFmpeg mix and measured loudness",
  );
  const call = async (url, body) => {
    const r = await fetch(service.url + "/api" + url, {
      method: "POST",
      headers: { Origin: service.url, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.text());
  };
  await call(`/projects/${p.id}/timeline`, p.timeline);
  assert.equal(service.store.project(p.id).timeline.cards.length, 1);
  await page.goto(service.url);
  await page.evaluate((id) => {
    localStorage.setItem("activeProject", id);
    localStorage.setItem("page", "Editor");
  }, p.id);
  await page.reload();
  await page.getByTitle("Edit timeline tracks").click();
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page
    .getByRole("button", { name: "Save timeline", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Edit timeline" })
    .waitFor({ state: "hidden" });
  assert.equal(service.store.project(p.id).timeline.cards.length, 2);
  console.log(
    "PASS: timeline editor browser save persists additional cards in project history",
  );
} finally {
  await browser.close();
  await service.close();
}

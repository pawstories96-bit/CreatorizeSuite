import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene, run } from "../server/core.mjs";
import { capturePNG } from "../server/frame-capture.mjs";
import {
  reconstructionKinds,
  reconstructionLooks,
} from "../public/lib/reconstruction/catalog.js";
const service = await startServer({
  root: path.resolve(".test-reconstruction-kit-" + uid()),
  port: 0,
});
const browser = await chromium.launch();
const points = [
  [-20, 4, 0],
  [-6, 12, -12],
  [12, 18, -10],
  [24, 6, 5],
  [6, 4, 18],
  [-16, 4, 12],
];
const options = {
  cabin: { rows: 5, cutaway: true },
  cockpit: { cutaway: true },
  room: { ceiling: false },
  forest: { count: 120, rMax: 35, farCount: 60, farMax: 60, seed: 12 },
  coaster: { points, closed: true },
  train: { points, closed: true, cars: 3, across: 2 },
  railing: {
    points: [
      [-3, 0, 0],
      [-1, 0, 0],
      [1, 0, 1],
      [3, 0, 1],
    ],
  },
  worldMap: {
    center: [15, 45],
    span: [25, 20],
    kmPerUnit: 40,
    highlight: { France: "#2f6fdb" },
  },
};
const kit = (kind, extra = {}) => ({
  id: kind,
  type: "reconstruction3d",
  text: "RECONSTRUCTION",
  ...extra,
  reconstruction: {
    kind,
    options: options[kind] || {},
    ...extra.reconstruction,
  },
});
try {
  const p = await service.store.create({
    title: "Internal reconstruction integration check",
    style: "3d",
    look: "White clay",
    castMode: "procedural",
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url + "/player.html?width=960&height=540&inspect=1");
  await page.waitForFunction(() => window.ready);
  for (const kind of reconstructionKinds) {
    const scale =
      kind === "airliner"
        ? 5
        : ["coaster", "train", "forest"].includes(kind)
          ? 6
          : kind === "worldMap"
            ? 14
            : kind === "usMap"
              ? 28
              : 1;
    const target =
      kind === "airliner"
        ? { x: 20, y: 0, z: 0 }
        : kind === "cabin"
          ? { x: 4, y: 1, z: 0 }
          : { x: 0, y: 1, z: 0 };
    p.shots = [
      {
        id: "s001",
        start: 0,
        end: 4,
        scene: validateScene({
          camera: { x: target.x + 8 * scale, y: 5 * scale, z: 11 * scale },
          cameraRig: {
            type: "dolly",
            target,
            to: { x: target.x + 7 * scale, y: 4.5 * scale, z: 10 * scale },
            duration: 4,
          },
          footnote: "Geometry integration check · illustrative layout",
          timeChip: "00:01",
          elements: [kit(kind)],
        }),
      },
    ];
    await page.evaluate((p) => window.FC.setProject(p), p);
    const result = await page.evaluate(() => window.FC.renderFrame(1));
    const stats = await page.evaluate(() => window.FC.getRenderStats());
    assert.ok(stats.triangles > 0, `${kind} must have visible real geometry`);
    const metric = result.metrics.find((m) => m.id === kind);
    assert.ok(metric?.worldBounds, `${kind} has measured 3D bounds`);
    assert.ok(
      metric.worldBounds.min.every(Number.isFinite),
      `${kind} finite geometry`,
    );
    if (
      [
        "cabin",
        "cockpit",
        "coaster",
        "train",
        "forest",
        "worldMap",
        "usMap",
        "airliner",
        "room",
      ].includes(kind)
    )
      fs.writeFileSync(
        `test-results/reconstruction-${kind}.png`,
        await capturePNG(page, 1, 960, 540),
      );
    console.log("Rendered", kind, stats.triangles);
  }
  // Track + moving train, out-of-order exact frame comparison.
  p.look = "Daylight";
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        camera: { x: 65, y: 42, z: 65 },
        cameraRig: {
          type: "dolly",
          target: { x: 0, y: 8, z: 0 },
          to: { x: 60, y: 38, z: 60 },
          duration: 4,
        },
        elements: [
          kit("coaster"),
          kit("train", {
            reconstruction: {
              kind: "train",
              options: options.train,
              motion: { from: 10, to: 70, duration: 4 },
            },
          }),
        ],
      }),
    },
  ];
  await page.evaluate((p) => window.FC.setProject(p), p);
  const a = await capturePNG(page, 1, 960, 540),
    b = await capturePNG(page, 3, 960, 540),
    again = await capturePNG(page, 1, 960, 540);
  assert.ok(!a.equals(b), "train/camera moves");
  assert.ok(a.equals(again), "train backward seeking is pixel exact");
  fs.writeFileSync("test-results/reconstruction-track-train.png", a);
  // Compare every look on identical geometry.
  const hashes = new Set();
  for (const look of Object.keys(reconstructionLooks)) {
    p.look = look;
    await page.evaluate((p) => window.FC.setProject(p), p);
    const image = await capturePNG(page, 1, 960, 540);
    hashes.add(image.toString("base64"));
  }
  assert.equal(hashes.size, 8, "all eight looks produce distinct frames");
  // Sourced cards and exact word-timed excerpt highlighting on both aspect ratios.
  await page.goto(service.url + "/player.html?inspect=1");
  await page.waitForFunction(() => window.ready);
  for (const format of ["16:9", "9:16"])
    for (const kind of ["quote", "article", "statement", "stat", "chart"]) {
      p.format = format;
      p.shots = [
        {
          id: "s001",
          start: 0,
          end: 4,
          scene: validateScene({
            evidence: {
              kind,
              title: "Reconstruction evidence",
              text: "The published report records the sequence. The mechanism is shown as an illustration.",
              source: "Internal test fixture · no factual claim",
              who: "Source attribution",
              value: "174",
              points: [
                [0, 12],
                [1, 24],
                [2, 18],
                [3, 40],
              ],
              xLabel: "Seconds",
              yLabel: "Recorded value",
              highlights:
                kind === "article"
                  ? [{ phrase: "records the sequence", at: 1, duration: 1 }]
                  : [],
            },
            elements: [
              {
                id: "backdrop",
                type: "rect",
                width: 1280,
                height: 720,
                fill: "#e7e7e5",
              },
            ],
          }),
        },
      ];
      await page.evaluate((p) => window.FC.setProject(p), p);
      const [w, h] = format === "9:16" ? [540, 960] : [960, 540];
      const frame = await capturePNG(page, 1.5, w, h);
      fs.writeFileSync(
        `test-results/reconstruction-card-${kind}-${format.replace(":", "-")}.png`,
        frame,
      );
      await capturePNG(page, 3, w, h);
      assert.ok(frame.equals(await capturePNG(page, 1.5, w, h)));
    }
  // Offline map route reveal and portrait source overlays.
  p.look = "Dark map";
  p.format = "9:16";
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        camera: { x: 60, y: 180, z: 150 },
        cameraRig: {
          type: "dolly",
          target: { x: 0, y: 0, z: 0 },
          to: { x: 55, y: 170, z: 140 },
          duration: 4,
        },
        footnote: "Natural Earth · route illustrative, not a finding",
        elements: [
          kit("worldMap", {
            reconstruction: {
              kind: "worldMap",
              options: options.worldMap,
              route: [
                [2.35, 48.86],
                [12.5, 41.9],
                [23.7, 37.98],
              ],
              pins: [
                [2.35, 48.86],
                [23.7, 37.98],
              ],
              motion: { duration: 4 },
            },
          }),
        ],
      }),
    },
  ];
  await page.evaluate((p) => window.FC.setProject(p), p);
  const route = await capturePNG(page, 1, 960, 540);
  await capturePNG(page, 3, 960, 540);
  assert.ok(route.equals(await capturePNG(page, 1, 960, 540)));
  assert.deepEqual(errors, []);
  // Persist and export through the production pipeline, then inspect the decoded stream.
  p.format = "16:9";
  p.look = "White clay";
  p.durationSec = 0.4;
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 0.4,
      narration: "Internal render check",
      scene: validateScene({
        camera: { x: 4, y: 3, z: 4 },
        cameraRig: {
          type: "dolly",
          target: { x: 0.5, y: 0.9, z: 0 },
          to: { x: 3.8, y: 2.8, z: 4 },
          duration: 0.4,
        },
        footnote: "Illustrative cockpit · integration check",
        elements: [kit("cockpit")],
      }),
    },
  ];
  service.store.saveProject(p);
  const job = service.pipeline.enqueue(p.id, "export", {
    resolution: "test",
    fps: 10,
    autoHeal: false,
  });
  let done;
  for (let i = 0; i < 1200; i++) {
    done = service.store.get("jobs", job.id);
    if (["done", "error"].includes(done.status)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(done.status, "done", done.error);
  const saved = service.store.project(p.id),
    file = path.join(service.store.projectDir(p.id), saved.lastExport);
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_read_frames",
        "-of",
        "json",
        file,
      ])
    ).stdout,
  );
  assert.equal(Number(probe.streams[0].nb_read_frames), 4);
  fs.writeFileSync(
    "test-results/reconstruction-kit-results.json",
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        kinds: reconstructionKinds,
        looks: 8,
        export: file,
        probe,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: all toolkit assemblies, eight distinct looks, deterministic moving trains/routes, real MP4 export",
  );
} finally {
  await browser.close();
  await service.close();
}

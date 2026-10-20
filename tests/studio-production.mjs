import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
import { capturePNG } from "../server/frame-capture.mjs";
const service = await startServer({
  root: path.resolve(".test-studio-production-" + uid()),
  port: 0,
});
const browser = await chromium.launch();
const wait = async (id) => {
  for (let i = 0; i < 1800; i++) {
    const job = service.store.get("jobs", id);
    if (["error", "done"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Studio production test timed out");
};
try {
  const p = await service.store.create({
    title: "Internal real Studio pipeline verification",
    style: "3d",
    look: "Studio",
  });
  p.words = [
    { w: "A", start: 0, end: 0.4 },
    { w: "ship", start: 0.4, end: 0.8 },
    { w: "moves.", start: 0.8, end: 1.8 },
    { w: "The", start: 2, end: 2.4 },
    { w: "camera", start: 2.4, end: 2.8 },
    { w: "follows.", start: 2.8, end: 3.8 },
  ];
  p.durationSec = 4;
  p.pipeline.wordsTimed = "done";
  p.shots = [
    {
      id: "s001",
      title: "Establish",
      narration: "A ship moves.",
      start: 0,
      end: 2,
      status: "pending",
    },
    {
      id: "s002",
      title: "Follow",
      narration: "The camera follows.",
      start: 2,
      end: 4,
      status: "pending",
    },
  ];
  service.store.saveProject(p);
  const calls = [];
  let qa = 0;
  service.pipeline.agents.generate = async ({ prompt, role, images }) => {
    if (prompt.startsWith("Plan this documentary")) {
      calls.push("plan");
      return {
        sets: [
          {
            id: "harbor",
            name: "Harbor",
            description:
              "A water channel with grounded embankments and a cargo vessel at meter scale",
          },
        ],
        assets: [
          {
            key: "ship",
            query: "cargo ship",
            purpose:
              "Generic cargo vessel visual proxy, not a historical replica",
          },
        ],
        shots: p.shots.map((s) => ({
          shotId: s.id,
          setId: "harbor",
          kind: "environment",
          focus: "Cargo vessel in its physical harbor",
          camera: s.id === "s001" ? "Wide establish" : "Side track",
          action: "Vessel moves forward",
          assetKeys: ["ship"],
        })),
      };
    }
    if (prompt.startsWith("Choose relevant models")) {
      calls.push("choose");
      assert.match(prompt, /kenney:watercraft-kit:ship-cargo-a/);
      return {
        choices: [
          {
            key: "ship",
            id: "kenney:watercraft-kit:ship-cargo-a",
            reason:
              "Generic low-poly cargo vessel with a real hull, containers and bridge",
          },
        ],
      };
    }
    if (role === "qa") {
      calls.push("qa");
      assert.equal(images.length, 6);
      assert.ok(images.every((f) => fs.statSync(f).size > 100));
      qa++;
      return {
        pass: qa !== 1,
        issues:
          qa === 1 ? ["Vessel is too small in frame; move camera closer"] : [],
      };
    }
    const current = service.store.project(p.id),
      model = current.production.acquired[0];
    assert.ok(
      model?.path &&
        fs.existsSync(path.join(service.store.projectDir(p.id), model.path)),
    );
    if (prompt.includes("Build shot 2/2")) {
      calls.push("build2");
      assert.equal(
        current.shots[0].visionQA.pass,
        true,
        "First shot must be visually accepted before building second",
      );
      assert.match(prompt, /Reuse this existing environment/);
      return {
        reuseSet: true,
        camera: { x: 7, y: 5, z: 11 },
        cameraRig: {
          type: "dolly",
          target: { x: 0, y: 1, z: 0 },
          to: { x: 6, y: 4, z: 10 },
          duration: 2,
          easing: "smooth",
        },
        elements: [
          {
            id: "vessel",
            type: "model",
            src: model.path,
            scale: 1,
            keyframes: [
              { time: 0, z: 0 },
              { time: 2, z: 0.5 },
            ],
          },
        ],
      };
    }
    calls.push(role === "edit" ? "repair" : "build1");
    return {
      background: "#b6cbd5",
      environment: {
        kind: "exterior",
        skyTop: "#719dcc",
        skyHorizon: "#dce4e6",
      },
      cameraFov: 42,
      camera: { x: role === "edit" ? 8 : 12, y: 6, z: 14 },
      cameraRig: {
        type: "dolly",
        target: { x: 0, y: 1, z: 0 },
        to: { x: 7, y: 5, z: 13 },
        targetTo: { x: 0, y: 1, z: 0.5 },
        duration: 2,
        easing: "smooth",
      },
      lighting: { ambient: 1.2, key: 2.5 },
      effects: { ssao: true, grain: 0.01 },
      elements: [
        { id: "vessel", type: "model", src: model.path, scale: 1 },
        {
          id: "water",
          type: "water",
          width: 300,
          height: 300,
          y: 0.08,
          fill: "#6e8e9a",
        },
        {
          id: "shore",
          type: "box",
          x: -25,
          y: -1,
          width: 25,
          height: 2,
          depth: 300,
          fill: "#738763",
        },
      ],
    };
  };
  const done = await wait(
    service.pipeline.enqueue(p.id, "build", { quality: "Verified" }).id,
  );
  assert.equal(done.status, "done", done.error);
  assert.deepEqual(calls, [
    "plan",
    "choose",
    "build1",
    "qa",
    "repair",
    "qa",
    "build2",
    "qa",
  ]);
  const updated = service.store.project(p.id),
    model = updated.production.acquired[0];
  assert.equal(updated.shots[0].quality, "Verified");
  assert.equal(updated.shots[1].quality, "Verified");
  assert.ok(
    updated.shots[1].scene.elements.some((e) => e.id === "shore"),
    "Shared environment must be inherited",
  );
  for (const shot of updated.shots)
    assert.ok(shot.production.modelPaths.includes(model.path));
  const document = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .readBinary(
      fs.readFileSync(path.join(service.store.projectDir(p.id), model.path)),
    );
  assert.ok(document.getRoot().listMeshes().length);
  assert.ok(
    document
      .getRoot()
      .listTextures()
      .every((t) => t.getImage()?.length),
  );
  assert.ok(model.bounds.size.every((n) => n > 0));
  assert.equal(model.author, "Kenney");
  const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url + "/player.html?width=1280&height=720&inspect=1");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((p) => window.FC.setProject(p), updated);
  const frame = await page.evaluate(() => window.FC.renderFrame(1));
  assert.ok(
    frame.metrics.some((m) => m.id === "vessel" && m.visibleSamples > 0),
  );
  fs.writeFileSync(
    "test-results/studio-pipeline.png",
    await capturePNG(page, 1, 1280, 720),
  );
  assert.deepEqual(errors, []);
  const skipped = await wait(
    service.pipeline.enqueue(p.id, "build", { quality: "Verified" }).id,
  );
  assert.equal(skipped.status, "done", skipped.error);
  assert.equal(
    calls.length,
    8,
    "Resume must reuse plan, assets and accepted shots",
  );
  const firstAccepted = JSON.stringify(service.store.project(p.id).shots[0]);
  const scoped = await wait(
    service.pipeline.enqueue(p.id, "build", {
      quality: "Standard",
      shotIds: ["s002"],
      forceRebuild: true,
    }).id,
  );
  assert.equal(scoped.status, "done", scoped.error);
  assert.equal(
    JSON.stringify(service.store.project(p.id).shots[0]),
    firstAccepted,
  );
  assert.deepEqual(calls.slice(8), ["build2"]);
  const revised = await wait(
    service.pipeline.enqueue(p.id, "build", {
      quality: "Standard",
      shotIds: ["s001"],
      direction: "Use a closer camera",
    }).id,
  );
  assert.equal(revised.status, "done", revised.error);
  assert.deepEqual(calls.slice(9), ["plan", "choose", "build1"]);
  const revisedProject = service.store.project(p.id);
  assert.equal(
    revisedProject.shots[0].production.fingerprint,
    revisedProject.production.fingerprint,
  );
  assert.notEqual(
    revisedProject.shots[1].production.fingerprint,
    revisedProject.production.fingerprint,
  );
  assert.equal(
    revisedProject.pipeline.scenes,
    "pending",
    "A partial rebuild must not certify stale shots against the new production plan",
  );
  const empty = await service.store.create({
    title: "Internal missing-assets failure",
    style: "3d",
    look: "Studio",
  });
  empty.words = p.words;
  empty.durationSec = 2;
  empty.pipeline.wordsTimed = "done";
  empty.shots = [
    {
      id: "s001",
      title: "Missing assets",
      narration: "A world.",
      start: 0,
      end: 2,
      status: "pending",
    },
  ];
  service.store.saveProject(empty);
  let sceneCalls = 0;
  service.pipeline.agents.generate = async ({ prompt }) => {
    if (prompt.startsWith("Plan this documentary"))
      return {
        sets: [
          { id: "world", name: "World", description: "A bespoke exterior" },
        ],
        assets: [],
        shots: [
          {
            shotId: "s001",
            setId: "world",
            kind: "environment",
            focus: "A landscape",
            camera: "Wide",
            action: "Still",
            assetKeys: [],
          },
        ],
      };
    if (prompt.startsWith("Choose relevant models")) return { choices: [] };
    sceneCalls++;
    return {
      environment: { kind: "exterior" },
      elements: [
        {
          id: "ground",
          type: "box",
          width: 300,
          height: 1,
          depth: 300,
          y: -0.5,
          fill: "#73945f",
        },
      ],
    };
  };
  const failed = await wait(
    service.pipeline.enqueue(empty.id, "build", { quality: "Standard" }).id,
  );
  assert.equal(failed.status, "error");
  assert.match(failed.error, /No suitable 3D assets were acquired/);
  assert.equal(sceneCalls, 0);
  assert.equal(
    service.store.project(empty.id).production.status,
    "needs-assets",
  );
  const intentional = await wait(
    service.pipeline.enqueue(empty.id, "build", {
      quality: "Standard",
      assetPolicy: "procedural",
    }).id,
  );
  assert.equal(intentional.status, "done", intentional.error);
  assert.equal(sceneCalls, 1);
  const accepted = structuredClone(
    service.store.project(empty.id).shots[0].scene,
  );
  let reviews = 0;
  const builder = service.pipeline.agents.generate;
  service.pipeline.agents.generate = async (args) => {
    if (args.role === "qa") {
      reviews++;
      return {
        pass: false,
        issues: ["Environment is still a sparse blockout"],
      };
    }
    return builder(args);
  };
  const rejected = await wait(
    service.pipeline.enqueue(empty.id, "build", {
      quality: "Verified",
      assetPolicy: "procedural",
      forceRebuild: true,
    }).id,
  );
  assert.equal(rejected.status, "error");
  assert.match(rejected.error, /Visual review .* needs attention/);
  assert.equal(
    reviews,
    3,
    "A failed visual review must not trigger nine automatic review cycles",
  );
  assert.equal(service.store.project(empty.id).shots[0].status, "needs-review");
  assert.deepEqual(
    service.store.project(empty.id).shots[0].scene,
    accepted,
    "A failed upgrade preserves the previously usable scene",
  );
  console.log(
    "PASS: actual official CC0 search/download, embedded texture and native bounds, mandatory model use, shared environment reuse, per-shot review/repair ordering, resume, current-shot scope, explicit missing-assets failure, procedural-only choice and bounded failed-review rollback",
  );
} finally {
  await browser.close();
  await service.close();
}

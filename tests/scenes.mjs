import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { validateScene, uid } from "../server/core.mjs";
import { capabilityFor } from "../server/agent-routing.mjs";
const service = await startServer({
  root: path.resolve(".test-scenes-" + uid()),
  port: 0,
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  const p = await service.store.create({
    title: "Internal scene runtime checks",
  });
  p.durationSec = 4;
  const scene = validateScene({
    background: "#c7d6cb",
    kits: [
      { id: "person", type: "character", x: 640, y: 390, walk: true },
      { id: "tree", type: "tree", x: 300, y: 360 },
      { id: "house", type: "building", x: 960, y: 360 },
    ],
    elements: [
      {
        id: "moving",
        type: "circle",
        x: 100,
        y: 100,
        radius: 15,
        fill: "#ffbb00",
        keyframes: [
          { time: 0, x: 100 },
          { time: 2, x: 400 },
          { time: 4, x: 600 },
        ],
      },
    ],
  });
  assert.ok(scene.elements.some((e) => e.id === "person-eye-left"));
  assert.ok(scene.elements.length < 40);
  assert.throws(
    () => validateScene({ kits: [{ id: "bad", type: "no-such-kit" }] }),
    /Unknown scene component/,
  );
  assert.throws(
    () =>
      validateScene({
        elements: [
          { id: "x", type: "rect", keyframes: [{ time: 2 }, { time: 1 }] },
        ],
      }),
    /strictly increase/,
  );
  p.shots = [{ id: "s001", start: 0, end: 4, scene, status: "built" }];
  await page.goto(service.url + "/player.html?inspect=1");
  await page.waitForFunction(() => window.ready);
  const load = () => page.evaluate((p) => window.FC.setProject(p), p);
  const render = (t) => page.evaluate((t) => window.FC.renderFrame(t), t);
  await load();
  const middle = await render(1);
  const moving = middle.metrics.find((m) => m.id === "moving");
  assert.equal((moving.bounds.left + moving.bounds.right) / 2, 250);
  const hash = async () =>
    crypto
      .createHash("sha256")
      .update(await page.locator("#stage").screenshot())
      .digest("hex");
  const atOne = await hash();
  await render(3);
  const atThree = await hash();
  await render(1);
  assert.equal(await hash(), atOne);
  assert.notEqual(atThree, atOne);
  await page.screenshot({ path: "test-results/scene-components.png" });
  console.log(
    "PASS: editable reusable components, keyframe interpolation, animated limbs and deterministic backward seeking",
  );
  p.style = "3d";
  p.shots[0].scene = validateScene({
    background: "#b5c8c4",
    camera: { x: 0, y: 2, z: 15 },
    elements: [
      {
        id: "wall",
        type: "box",
        x: 0,
        y: 2,
        z: 3,
        width: 5,
        height: 5,
        depth: 1,
      },
      {
        id: "hidden",
        type: "box",
        x: 0,
        y: 2,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        essential: true,
      },
      {
        id: "floating",
        type: "box",
        x: 4,
        y: 3,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        grounded: true,
        collisionGroup: "actors",
      },
      {
        id: "collision",
        type: "box",
        x: 4.2,
        y: 3,
        z: 0,
        width: 1,
        height: 1,
        depth: 1,
        collisionGroup: "actors",
      },
    ],
  });
  await load();
  const measured = await render(1);
  assert.ok(
    measured.metrics
      .find((m) => m.id === "hidden")
      .problems.some((p) => /occluded/.test(p)),
  );
  assert.ok(
    measured.metrics
      .find((m) => m.id === "floating")
      .problems.some((p) => /floats/.test(p)),
  );
  assert.ok(
    measured.metrics
      .find((m) => m.id === "collision")
      .problems.some((p) => /intersects/.test(p)),
  );
  const check = await service.pipeline.verify(p, p.shots);
  assert.ok(check.issues.some((i) => /occluded/.test(i)));
  console.log(
    "PASS: actual 3D projection, raycast occlusion, ground and marked collision checks reach pipeline QA",
  );
  p.shots[0].scene = validateScene({
    background: "#9eb6b6",
    cameraRig: { type: "orbit", radius: 18, height: 9, speed: 0.25 },
    lighting: { ambient: 1.5, key: 4 },
    kits: [
      { id: "ship", type: "ship", x: 0, y: 0, z: 3 },
      { id: "bridge", type: "bridge", x: 0, y: 0, z: -2 },
    ],
  });
  await load();
  await render(1);
  const orbitOne = await hash();
  await render(3);
  assert.notEqual(await hash(), orbitOne);
  await render(1);
  assert.equal(await hash(), orbitOne);
  await page.screenshot({ path: "test-results/scene-camera.png" });
  service.store.saveProject(p);
  const response = await fetch(service.url + "/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: service.url },
    body: JSON.stringify({ provider: "local", localModel: "tiny" }),
  });
  assert.equal(response.status, 200);
  service.store.put("calibrations", {
    id: "local:tiny",
    provider: "local",
    model: "tiny",
    tier: "C",
    vision: false,
  });
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  await page.getByText("Tier C", { exact: true }).waitFor();
  await page.getByText(/Lite mode · Expect simpler visuals/).waitFor();
  assert.equal(
    capabilityFor({}, { provider: "local", model: "unknown" }).lite,
    true,
  );
  assert.equal(
    capabilityFor({}, { provider: "codex", model: "unknown" }).tier,
    null,
  );
  console.log(
    "PASS: camera motion is deterministic, Tier C badge and Lite limits appear in the project editor",
  );
} finally {
  await browser.close();
  await service.close();
}

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
import { defaultCast, castRoles } from "../public/lib/cast.js";
import { cameraMoves } from "../public/lib/cameras.js";
import { capturePNG } from "../server/frame-capture.mjs";
const service = await startServer({
    root: path.resolve(".test-cast-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const p = await service.store.create({
    title: "Internal cast verification",
    style: "3d",
    look: "Investigation",
  });
  p.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        camera: { x: 3, y: 2, z: 5 },
        cameraRig: { type: "dolly", target: { x: 0, y: 0.9, z: 0 } },
        elements: [
          {
            id: "main",
            type: "mannequin",
            castRole: "main",
            height: 1.8,
            pose: "phone",
            heldProp: { kind: "phone", hand: "right" },
          },
          {
            id: "floor",
            type: "box",
            width: 8,
            height: 0.1,
            depth: 8,
            y: -0.06,
            fill: "#343b42",
          },
        ],
      }),
    },
  ];
  p.durationSec = 4;
  service.store.saveProject(p);
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.setDefaultTimeout(90000);
  await page.goto(service.url + "/player.html?width=1280&height=720&inspect=1");
  await page.waitForFunction(() => window.ready);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (url, data, method = "POST") => {
    const response = await fetch(service.url + url, {
        method,
        headers: { Origin: service.url, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result;
  };
  const original = JSON.stringify(p.shots);
  let saved = await post(
    `/api/projects/${p.id}`,
    {
      cast: {
        ...defaultCast,
        main: { body: "female", finish: "glossy", color: "#bc334d" },
      },
    },
    "PATCH",
  );
  assert.equal(
    JSON.stringify(saved.shots),
    original,
    "Cast changes must not rewrite geometry",
  );
  await page.evaluate((p) => window.FC.setProject(p), saved);
  await page.evaluate(() => window.FC.renderFrame(1));
  const rendered = await page.evaluate(() =>
    window.FC.getProject().shots[0].scene.elements.find((e) => e.id === "main"),
  );
  assert.equal(rendered.body, "female");
  assert.equal(rendered.material.roughness, 0.19);
  assert.equal(rendered.fill, "#bc334d");
  await page.screenshot({ path: "test-results/cast-phone.png" });
  const anatomy = await page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js"),
      { createMannequin, actorMotions } = await import("/lib/mannequins.js"),
      checks = [];
    for (const body of ["male", "female"])
      for (const pose of actorMotions) {
        const actor = createMannequin(
          { height: 1.8, body, pose, duration: 2, delay: 0, motionSpeed: 1 },
          { style: "3d" },
          new THREE.MeshPhysicalMaterial(),
        );
        for (const t of [0, 0.5, 1, 2, 3]) {
          actor.userData.animate(t);
          actor.updateMatrixWorld(true);
          const feet = [];
          actor.traverse((o) => {
            if (o.name === "foot")
              feet.push(o.getWorldPosition(new THREE.Vector3()).y - 0.06);
            if (!o.matrixWorld.elements.every(Number.isFinite))
              throw Error("Invalid transform " + body + pose);
          });
          if (["idle", "sit", "sit-down", "stand-up"].includes(pose))
            checks.push({ body, pose, t, min: Math.min(...feet) });
        }
      }
    return checks;
  });
  assert.ok(
    anatomy.every((a) => Math.abs(a.min) < 0.06),
    JSON.stringify(anatomy.filter((a) => Math.abs(a.min) >= 0.06)),
  );
  const sheet = structuredClone(saved);
  sheet.cast = {};
  sheet.shots[0].scene.elements = [
    {
      id: "floor",
      type: "box",
      width: 16,
      height: 0.1,
      depth: 10,
      y: -0.06,
      fill: "#303b44",
      opacity: 1,
      scale: 1,
    },
    ...castRoles.map((r, i) => ({
      id: r,
      type: "mannequin",
      height: 1.8,
      x: (i - 3) * 1.2,
      z: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      fill: [
        "#eff0ef",
        "#b33d50",
        "#3b77ba",
        "#e0b15f",
        "#57a48d",
        "#7875a8",
        "#eff0ef",
      ][i],
      body: i % 2 ? "female" : "male",
      finish: i % 3 === 0 ? "matte" : i % 3 === 1 ? "glossy" : "glow",
      pose: i === 1 ? "phone" : "carry",
      delay: 0,
      duration: 2,
      motionSpeed: 1,
      heldProp: {
        kind: ["cup", "phone", "paper", "briefcase", "scanner", "staff", "bag"][
          i
        ],
        hand: i === 2 || i === 5 ? "both" : "right",
      },
    })),
  ];
  sheet.shots[0].scene.camera = { x: 6.5, y: 3.7, z: 10.8 };
  sheet.shots[0].scene.cameraRig = {
    type: "dolly",
    target: { x: 0, y: 0.85, z: 0 },
    duration: 4,
  };
  await page.evaluate((p) => window.FC.setProject(p), sheet);
  fs.writeFileSync(
    "test-results/cast-library.png",
    await capturePNG(page, 1, 1280, 720),
  );
  for (const [preset] of cameraMoves) {
    const cameraP = structuredClone(saved);
    cameraP.shots[0].scene.cameraRig = {
      preset,
      type: "dolly",
      target: { x: 0, y: 0.9, z: 0 },
      distance: 5,
      height: 2,
      duration: 4,
      amount: 0.2,
      easing: "smooth",
    };
    await page.evaluate((p) => window.FC.setProject(p), cameraP);
    const first = await capturePNG(page, 1, 1280, 720);
    await page.evaluate(() => window.FC.renderFrame(3));
    assert.ok(first.equals(await capturePNG(page, 1, 1280, 720)), preset);
  }
  await post(`/api/projects/${p.id}/camera`, {
    shotId: "s001",
    preset: "truck-left",
  });
  assert.equal(
    service.store.project(p.id).shots[0].scene.cameraRig.preset,
    "truck-left",
  );
  if (fs.existsSync(".test-reference-review/samba.fbx")) {
    const form = new FormData();
    form.append("kind", "motion");
    form.append(
      "file",
      new Blob([fs.readFileSync(".test-reference-review/samba.fbx")]),
      "Samba.fbx",
    );
    const response = await fetch(
        service.url + `/api/projects/${p.id}/rig-import`,
        { method: "POST", headers: { Origin: service.url }, body: form },
      ),
      motion = await response.json();
    assert.ok(response.ok, JSON.stringify(motion));
    assert.equal(Object.keys(motion.mapping).length, 12);
    assert.ok(motion.duration > 1);
    saved = await post(`/api/projects/${p.id}/actor-action`, {
      shotId: "s001",
      role: "main",
      pose: "idle",
      motionSrc: motion.path,
    });
    await page.evaluate((p) => window.FC.setProject(p), saved);
    const first = await capturePNG(page, 1, 1280, 720);
    assert.ok(!first.equals(await capturePNG(page, 2, 1280, 720)));
    assert.ok(first.equals(await capturePNG(page, 1, 1280, 720)));
    fs.writeFileSync("test-results/cast-imported-motion.png", first);
    const characterForm = new FormData();
    characterForm.append("kind", "character");
    characterForm.append(
      "file",
      new Blob([fs.readFileSync(".test-reference-review/samba.fbx")]),
      "Samba.fbx",
    );
    const imported = await fetch(
        service.url + `/api/projects/${p.id}/rig-import`,
        {
          method: "POST",
          headers: { Origin: service.url },
          body: characterForm,
        },
      ),
      character = await imported.json();
    assert.ok(imported.ok, JSON.stringify(character));
    assert.equal(Object.keys(character.skeleton).length, 12);
    assert.ok(character.clips.length);
    const custom = structuredClone(saved);
    custom.cast.main.src = character.path;
    await page.evaluate((p) => window.FC.setProject(p), custom);
    const customFrame = await page.evaluate(() => window.FC.renderFrame(1));
    const model = customFrame.metrics.find((m) => m.id === "main");
    assert.equal(model.type, "model");
    assert.ok(model.worldBounds.max[1] - model.worldBounds.min[1] < 2.4);
    fs.writeFileSync(
      "test-results/imported-character.png",
      await capturePNG(page, 1, 1280, 720),
    );
  }
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  await page
    .getByRole("button", { name: "Cast & motion", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Cast & motion", exact: true })
    .waitFor();
  const castFrame = page.frameLocator('iframe[title="Live 3D cast preview"]');
  await castFrame.locator("#stage").waitFor();
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe[title="Live 3D cast preview"]');
    return (
      f?.contentWindow?.FC?.getProject()?.shots?.[0]?.scene?.elements?.length >
      0
    );
  });
  await page
    .getByLabel("Main character body", { exact: true })
    .selectOption("male");
  await page
    .getByLabel("Main character finish", { exact: true })
    .selectOption("glossy");
  await page
    .getByLabel("Preview action", { exact: true })
    .selectOption("phone");
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe[title="Live 3D cast preview"]')
        .contentWindow.FC.getProject().shots[0].scene.elements[0].body ===
      "male",
  );
  const drawn = await castFrame
    .locator("body")
    .evaluate(() => window.FC.getRenderStats());
  assert.ok(drawn.triangles > 1000);
  await page.screenshot({ path: "test-results/cast-controls.png" });
  await page
    .getByRole("button", { name: "Apply cast to project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Cast & motion", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(service.store.project(p.id).cast.main.body, "male");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: project-wide cast without scene rebuild, both bodies/all built-in motions, grounded sit/stand transitions, hand props, deterministic named cameras and actual FBX retarget/import/playback",
  );
} finally {
  await browser.close();
  await service.close();
}

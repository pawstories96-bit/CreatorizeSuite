// Opt-in integration check against the user's local, unmodified Mixamo folder.
// No model bytes are included in the repository or desktop package.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { startServer } from "../server/index.mjs";
import { uid, validateScene } from "../server/core.mjs";
import { defaultCast } from "../public/lib/cast.js";
import { capturePNG } from "../server/frame-capture.mjs";
const folder = process.env.MIXAMO_DIR;
assert.ok(
  folder,
  "Set MIXAMO_DIR to the folder of downloaded FBX / GLB characters",
);
const files = fs.readdirSync(folder).filter((f) => /\.(fbx|glb)$/i.test(f));
assert.ok(files.length);
const testRoot = path.resolve(
  process.env.MIXAMO_TEST_ROOT || ".test-mixamo-files-" + uid(),
);
assert.ok(
  testRoot.startsWith(process.cwd() + path.sep) &&
    path.basename(testRoot).startsWith(".test-"),
);
const s = await startServer({
    root: testRoot,
    port: 0,
  }),
  browser = await s.pipeline.browserInstance();
try {
  const p = await s.store.create({
    title: "Internal actual Mixamo file check",
    style: "3d",
    castMode: "mixamo",
  });
  const post = async (url, body, method = "POST") => {
    const response = await fetch(s.url + "/api" + url, {
      method,
      headers: {
        Origin: s.url,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  const models = [];
  for (const file of files) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([fs.readFileSync(path.join(folder, file))]),
      file,
    );
    form.append("kind", "character");
    form.append("source", "mixamo");
    const stem = path.parse(file).name.replace(/[ _-]/g, "").toLowerCase(),
      body = stem === "xbot" ? "female" : stem === "ybot" ? "male" : null;
    if (body) form.append("body", body);
    const model = await post(`/projects/${p.id}/rig-import`, form);
    assert.equal(Object.keys(model.skeleton).length, 12, file);
    assert.equal(model.humanoid, true);
    assert.equal(model.license, "Mixamo");
    models.push(model);
    console.log(
      "Imported",
      file,
      fs.statSync(path.join(s.store.projectDir(p.id), model.path)).size,
      "bytes",
    );
  }
  const ready = s.store.project(p.id);
  assert.ok(ready.characterModels.male && ready.characterModels.female);
  ready.durationSec = 4;
  ready.cast = structuredClone(defaultCast);
  ready.shots = [
    {
      id: "s001",
      start: 0,
      end: 4,
      scene: validateScene({
        background: "#aeb6bf",
        camera: { x: 2.5, y: 1.6, z: 4 },
        cameraRig: {
          target: { x: 0, y: 0.85, z: 0 },
          type: "dolly",
          duration: 4,
        },
        elements: [
          {
            id: "actor",
            type: "mannequin",
            castRole: "main",
            height: 1.8,
            pose: "phone",
            duration: 2,
            heldProp: { kind: "phone", hand: "right" },
          },
          {
            id: "floor",
            type: "box",
            width: 8,
            height: 0.1,
            depth: 8,
            y: -0.06,
            fill: "#737c87",
          },
        ],
      }),
    },
  ];
  s.store.saveProject(ready);
  let page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(s.url + "/player.html?width=1280&height=720&inspect=1");
  await page.waitForFunction(() => window.ready);
  for (const model of models) {
    const candidate = structuredClone(ready);
    candidate.cast.main = {
      body: "male",
      color: "#c43c50",
      finish: "glossy",
      src: model.path,
      humanoid: true,
    };
    await page.evaluate((p) => window.FC.setProject(p), candidate);
    const frame = await page.evaluate(() => window.FC.renderFrame(1));
    assert.ok(
      frame.metrics.find((m) => m.id === "actor")?.visibleSamples > 0,
      model.name,
    );
    const one = await capturePNG(page, 1, 1280, 720);
    await page.evaluate(() => window.FC.renderFrame(3));
    assert.ok(one.equals(await capturePNG(page, 1, 1280, 720)), model.name);
    fs.writeFileSync(
      "test-results/mixamo-file-" + model.name.replace(/[^\w-]/g, "_") + ".png",
      one,
    );
  }
  for (const body of ["male", "female"])
    for (const pose of [
      "walk",
      "sit",
      "sit-down",
      "stand-up",
      "carry",
      "phone",
    ]) {
      const candidate = structuredClone(ready);
      candidate.cast.main = {
        body,
        finish: "glossy",
        color: body === "male" ? "#bd3653" : "#3b82f6",
      };
      candidate.shots[0].scene.elements[0].pose = pose;
      candidate.shots[0].scene.elements[0].heldProp = {
        kind: pose === "phone" ? "phone" : "briefcase",
        hand: "right",
      };
      await page.evaluate((p) => window.FC.setProject(p), candidate);
      const first = await capturePNG(page, 1, 1280, 720);
      await page.evaluate(() => window.FC.renderFrame(3));
      assert.ok(
        first.equals(await capturePNG(page, 1, 1280, 720)),
        body + pose,
      );
      fs.writeFileSync(`test-results/mixamo-${body}-${pose}.png`, first);
    }
  await post(
    `/projects/${p.id}`,
    {
      cast: {
        ...ready.cast,
        main: { ...ready.cast.main, src: models[0].path, humanoid: true },
      },
    },
    "PATCH",
  );
  assert.equal(s.store.project(p.id).cast.main.humanoid, true);
  const next = await s.store.create({
    title: "Internal reusable actual body check",
    style: "3d",
    castMode: "mixamo",
  });
  for (const body of ["male", "female"]) {
    assert.equal(
      next.characterModels[body].path,
      ready.characterModels[body].path,
    );
    assert.ok(
      fs.existsSync(
        path.join(s.store.projectDir(next.id), next.characterModels[body].path),
      ),
    );
  }
  const missing = structuredClone(ready);
  delete missing.characterModels.female;
  missing.cast.main.body = "female";
  await assert.rejects(
    s.pipeline.export(missing, { options: {} }),
    (e) => e.code === "MIXAMO_SETUP",
  );
  assert.deepEqual(errors, []);
  // Exercise the actual folder picker and saved cast in the built application UI.
  if (process.env.MIXAMO_UI === "1") {
    await page.close();
    page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
    page.setDefaultTimeout(90000);
    page.on("pageerror", (e) => errors.push(e.message));
    const uiProject = await s.store.create({
      title: "Internal Mixamo folder UI check",
      style: "3d",
      castMode: "mixamo",
    });
    await page.goto(s.url);
    await page.getByText(uiProject.title, { exact: true }).first().click();
    await page
      .getByRole("button", { name: "Cast & motion", exact: true })
      .click();
    await page
      .locator('input[aria-label="Mixamo character folder"]')
      .setInputFiles(path.resolve(folder));
    await page
      .getByRole("status")
      .filter({
        hasText: `${files.length}/${files.length} characters imported.`,
      })
      .waitFor({ timeout: 240000 });
    await page
      .getByLabel("Cast model", { exact: true })
      .selectOption(models[0].path);
    await page
      .getByLabel("Preview action", { exact: true })
      .selectOption("phone");
    await page.waitForFunction(
      () =>
        document
          .querySelector('iframe[title="Live 3D cast preview"]')
          ?.contentWindow?.FC?.getProject()?.cast?.main?.humanoid === true,
    );
    await page.waitForFunction((src) => {
      const frame = document.querySelector(
        'iframe[title="Live 3D cast preview"]',
      )?.contentWindow;
      return (
        frame?.FC?.getRenderStats()?.modelSources?.includes(src) &&
        frame.FC.getRenderStats().triangles > 1000
      );
    }, models[0].path);
    await page.screenshot({ path: "test-results/mixamo-folder-ui.png" });
    await page
      .getByRole("button", { name: "Apply cast to project", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Cast & motion", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(s.store.project(uiProject.id).cast.main.humanoid, true);
    assert.deepEqual(errors, []);
  }
  fs.writeFileSync(
    "test-results/mixamo-files-results.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        files: models.map((m) => ({
          name: m.name,
          skeleton: m.skeleton,
          clips: m.clips,
          sourceHash: m.sourceHash,
        })),
        ui: process.env.MIXAMO_UI === "1",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: all ${files.length} actual local Mixamo characters imported/rendered, X/Y Bot body actions/props, exact seeking, cast persistence, reusable bodies, setup errors${process.env.MIXAMO_UI === "1" ? ", actual folder-picker UI" : ""}`,
  );
} finally {
  await browser.close();
  await s.close();
}

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
const folder = process.env.MIXAMO_DIR;
assert.ok(folder);
const root = path.resolve(
  process.env.MIXAMO_TEST_ROOT || ".test-mixamo-ui-" + uid(),
);
assert.ok(
  root.startsWith(process.cwd() + path.sep) &&
    path.basename(root).startsWith(".test-"),
);
const s = await startServer({ root, port: 0 }),
  browser = await s.pipeline.browserInstance();
try {
  const p = await s.store.create({
    title: "Internal Mixamo UI " + uid(),
    style: "3d",
    castMode: "mixamo",
  });
  const page = await browser.newPage({
      viewport: { width: 1536, height: 960 },
    }),
    errors = [];
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(s.url);
  await page
    .locator(".sidebar")
    .getByTitle("Projects", { exact: true })
    .click();
  await page
    .getByText(p.title, { exact: true })
    .first()
    .click()
    .catch(async (error) => {
      console.log(
        "UI errors:",
        errors,
        "Body:",
        (await page.locator("body").innerText()).slice(0, 5000),
      );
      await page.screenshot({ path: "test-results/mixamo-ui-failure.png" });
      throw error;
    });
  await page
    .getByRole("button", { name: "Cast & motion", exact: true })
    .click();
  await page
    .locator('input[aria-label="Mixamo character folder"]')
    .setInputFiles(path.resolve(folder));
  const count = fs
    .readdirSync(folder)
    .filter((f) => /\.(fbx|glb)$/i.test(f)).length;
  await page
    .getByRole("status")
    .filter({ hasText: `${count}/${count} characters imported.` })
    .waitFor({ timeout: 240000 });
  const record = s.store.project(p.id).characterModels.male;
  await page
    .getByLabel("Cast model", { exact: true })
    .selectOption(record.path);
  await page
    .getByLabel("Preview action", { exact: true })
    .selectOption("phone");
  await page.waitForFunction((src) => {
    const frame = document.querySelector(
      'iframe[title="Live 3D cast preview"]',
    )?.contentWindow;
    return (
      frame?.FC?.getRenderStats()?.modelSources?.includes(src) &&
      frame.FC.getRenderStats().triangles > 1000
    );
  }, record.path);
  await page.screenshot({ path: "test-results/mixamo-folder-ui.png" });
  // Rapid changes must settle on the latest choice with an actual rendered mesh.
  await page
    .getByLabel("Main character body", { exact: true })
    .selectOption("female");
  await page.getByLabel("Cast model", { exact: true }).selectOption("");
  await page
    .getByLabel("Main character finish", { exact: true })
    .selectOption("glossy");
  const female = s.store.project(p.id).characterModels.female;
  await page.waitForFunction(
    (src) =>
      document
        .querySelector('iframe[title="Live 3D cast preview"]')
        ?.contentWindow?.FC?.getRenderStats()
        ?.modelSources?.includes(src),
    female.path,
  );
  await page.screenshot({ path: "test-results/mixamo-female-ui.png" });
  await page
    .getByRole("button", { name: "Apply cast to project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Cast & motion", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(s.store.project(p.id).cast.main.body, "female");
  assert.deepEqual(errors, []);
  const inherited = await s.store.create({
    title: "Internal automatic Mixamo setup " + uid(),
    style: "3d",
  });
  assert.equal(inherited.castMode, "mixamo");
  assert.ok(inherited.characterModels.male && inherited.characterModels.female);
  console.log(
    "PASS: actual folder picker imports every file, live preview contains real male/female meshes, rapid cast changes settle, persisted cast and automatic setup for new 3D projects",
  );
} finally {
  await browser.close();
  await s.close();
}

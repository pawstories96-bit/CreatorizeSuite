import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
const service = await startServer({
    root: path.resolve(".test-image-settings-" + uid()),
    port: 0,
  }),
  browser = await chromium.launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(service.url);
  await page
    .locator(".sidebar")
    .getByTitle("Settings", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Image provider", exact: true })
    .selectOption("fal");
  await page
    .getByRole("textbox", { name: "Search image models" })
    .fill("nano banana");
  await page
    .getByRole("button", { name: "Fetch available image models" })
    .click();
  const select = page.getByRole("combobox", {
    name: "Text image model",
    exact: true,
  });
  await select
    .locator('option[value="fal-ai/nano-banana-2"]')
    .waitFor({ state: "attached", timeout: 45000 });
  await select.selectOption("fal-ai/nano-banana-2");
  await page
    .getByRole("combobox", { name: "Image operation" })
    .selectOption("image-to-image");
  await page
    .getByRole("button", { name: "Fetch available image models" })
    .click();
  const edit = page.getByRole("combobox", {
    name: "Reference image model",
    exact: true,
  });
  await edit
    .locator('option[value="fal-ai/nano-banana-2/edit"]')
    .waitFor({ state: "attached", timeout: 45000 });
  await edit.selectOption("fal-ai/nano-banana-2/edit");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByText("Settings saved", { exact: true }).waitFor();
  assert.equal(service.store.settings().falModel, "fal-ai/nano-banana-2");
  assert.equal(
    service.store.settings().falEditModel,
    "fal-ai/nano-banana-2/edit",
  );
  await page
    .getByRole("combobox", { name: "Image provider", exact: true })
    .selectOption("higgsfield");
  await page
    .getByRole("combobox", { name: "Image operation" })
    .selectOption("text-to-image");
  await page.getByRole("textbox", { name: "Search image models" }).fill("");
  await page
    .getByRole("button", { name: "Fetch available image models" })
    .click();
  await page
    .getByRole("combobox", { name: "Text image model" })
    .locator('option[value="higgsfield-ai/soul/standard"]')
    .waitFor({ state: "attached", timeout: 45000 });
  await page.getByText(/public API schema \(partial catalog/).waitFor();
  await page
    .getByRole("combobox", { name: "Image provider", exact: true })
    .selectOption("flow");
  await page.getByRole("button", { name: "Check Flow connection" }).click();
  await page.getByText(/Open the browser, sign in yourself/).waitFor();
  await page.screenshot({ path: "test-results/image-settings.png" });
  assert.equal(service.store.all("projects").length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: image provider UI fetches actual public fal text/edit models and partial Higgsfield schema, saves separate choices and reports Flow sign-in/project requirements without creating examples",
  );
} finally {
  await browser.close();
  await service.close();
}

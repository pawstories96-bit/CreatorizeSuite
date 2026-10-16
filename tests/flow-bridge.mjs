import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { Store, uid } from "../server/core.mjs";
import { FlowBridge, flowURL } from "../server/flow-bridge.mjs";
const store = await new Store().init(
    path.resolve(".test-flow-bridge-" + uid()),
  ),
  browser = await chromium.launch(),
  context = await browser.newContext();
try {
  assert.throws(() => flowURL("https://labs.google.evil.test/fx/tools/flow"));
  assert.throws(() => flowURL("https://labs.google/fx/tools/other"));
  const png = new PNG({ width: 640, height: 360 });
  png.data.fill(180);
  const image = PNG.sync.write(png);
  png.data.fill(120);
  const referenceImage = PNG.sync.write(png);
  const p = await store.create({ title: "Internal browser bridge check" }),
    bridge = new FlowBridge(store);
  await assert.rejects(
    bridge.generate({
      project: p,
      prompt: "Bridge concept",
      purpose: "concept",
    }),
    /Open the browser/,
  );
  await context.route("https://labs.google/**", async (route) => {
    if (route.request().url().endsWith("result.png"))
      return route.fulfill({ body: image, contentType: "image/png" });
    return route.fulfill({
      contentType: "text/html",
      body: '<textarea aria-label="Image prompt"></textarea><input type="file" accept="image/*" multiple><button onclick="window.submits=(window.submits||0)+1;setTimeout(()=>{const i=new Image();i.src=\'https://labs.google/result.png\';document.body.append(i)},40)">Generate Image</button>',
    });
  });
  bridge.page = await context.newPage();
  bridge.context = context;
  await bridge.page.goto(
    "https://labs.google/fx/tools/flow/project/internal-test",
  );
  assert.equal((await bridge.status()).ready, true);
  const result = await bridge.generate({
    project: p,
    prompt: "A textured bridge concept",
    purpose: "concept",
    references: [{ bytes: referenceImage, mime: "image/png", name: "reference.png" }],
  });
  assert.deepEqual(result.bytes, image);
  assert.equal(
    await bridge.page.locator("textarea").inputValue(),
    "A textured bridge concept",
  );
  assert.equal(await bridge.page.evaluate(() => window.submits), 1);
  assert.equal(store.all("flowRequests")[0].status, "completed");
  assert.equal((await bridge.status()).busy, false);
  console.log(
    "PASS: real browser-control fixture exercises Flow readiness, visible prompt/reference upload, single submission and automatic image import. Authenticated Google Flow generation was not tested.",
  );
} finally {
  await browser.close();
}

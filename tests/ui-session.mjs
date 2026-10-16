import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
const root = path.resolve(".test-ui-session-" + uid()),
  browser = await chromium.launch();
let service;
try {
  service = await startServer({ root, port: 0 });
  const p = await service.store.create({
      title: "Internal durable editor check",
    }),
    page = await browser.newPage();
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  for (
    let i = 0;
    i < 100 && service.store.get("uiSession", "desktop")?.page !== "Editor";
    i++
  )
    await new Promise((r) => setTimeout(r, 50));
  assert.equal(service.store.get("uiSession", "desktop").activeId, p.id);
  const oldURL = service.url;
  await page.close();
  await service.close();
  service = await startServer({ root, port: 0 });
  assert.notEqual(service.url, oldURL);
  const fresh = await browser.newPage();
  await fresh.goto(service.url);
  await fresh
    .getByRole("button", { name: "Pick parts", exact: true })
    .waitFor();
  assert.equal(
    await fresh.evaluate(() => localStorage.getItem("activeProject")),
    p.id,
  );
  console.log(
    "PASS: selected project and editor restore from SQLite after a desktop server restart on a new port",
  );
} finally {
  await browser.close();
  await service?.close();
}

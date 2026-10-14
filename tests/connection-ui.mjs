import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-connection-ui-" + uid()), port: 0 });
const browser = await chromium.launch({ headless: true });
try {
  service.store.put("jobs", { id: uid(), action: "test", status: "error", provider: "codex", createdAt: "2026-10-13T12:29:36Z", finishedAt: "2026-10-13T12:30:01Z", error: "WARN plugin icon ignored", events: [
    { at: "2026-10-13T12:29:36Z", type: "info", text: "Using codex" },
    { at: "2026-10-13T12:30:01Z", type: "error", text: JSON.stringify({ type: "turn.failed", error: { message: "You have hit your usage limit. Try again at 6:08 PM." } }) },
  ] });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const localRequests = [], errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (/models.*provider=local/.test(r.url())) localRequests.push(r.url()); });
  await page.goto(service.url);
  await page.locator(".sidebar").getByTitle("Connections", { exact: true }).click();
  await page.getByText(/Provider usage limit reached/).waitFor();
  assert.equal(await page.locator("label").filter({ hasText: /^Local model$/ }).count(), 0);
  assert.equal(await page.getByText("WARN plugin icon ignored", { exact: true }).isVisible(), false);
  assert.equal(localRequests.length, 0);
  await page.getByText("Diagnostic log", { exact: true }).click();
  await page.locator("details[open]").getByText(/turn.failed/).waitFor();
  await page.screenshot({ path: "test-results/connection-error-fixed.png", fullPage: true });
  await page.locator(".sidebar").getByTitle("Usage", { exact: true }).click();
  await page.getByRole("heading", { name: /Usage/ }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: historical quota message, collapsible diagnostics, no unsolicited local-server request, Usage navigation");
} finally { await browser.close(); await service.close(); }

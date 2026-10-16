import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { atomic, uid } from "../server/core.mjs";
const root = path.resolve(".test-portable-" + uid());
const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const executable = path.resolve(
  process.env.PACKAGED_EXE || "release/v0.3.0/Creatorize Suite 0.3.0.exe",
);
const child = spawn(
  executable,
  [
    `--remote-debugging-port=${port}`,
    "--enable-automation",
    `--user-data-dir=${path.join(root, "profile")}`,
  ],
  {
    env: { ...process.env, FRAMECRAFT_WORKSPACE: root },
    windowsHide: true,
    stdio: "ignore",
  },
);
let browser;
try {
  let endpoint;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode != null)
      throw Error(`Portable launcher exited with ${child.exitCode}`);
    try {
      endpoint = await fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.json(),
      );
      break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!endpoint)
    throw Error(
      "Portable application did not expose its test browser within 150 seconds",
    );
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  const context = browser.contexts()[0];
  let page = context.pages()[0] || (await context.waitForEvent("page"));
  await page
    .getByRole("heading", { name: "Make something worth watching." })
    .waitFor({ timeout: 60000 });
  const state = await page.evaluate(() =>
    fetch("/api/state").then((r) => r.json()),
  );
  assert.equal(state.projects.length, 0);
  assert.equal(state.channels.length, 0);
  assert.equal(state.routines.length, 0);
  assert.equal(state.thumbnails.length, 0);
  const browserSession = await browser.newBrowserCDPSession();
  const commandLine = await browserSession.send(
    "Browser.getBrowserCommandLine",
  );
  const resources = path.join(
    path.dirname(commandLine.arguments[0]),
    "resources",
  );
  assert.ok(
    fs.existsSync(
      path.join(resources, "licenses", "@fontsource-variable-dm-sans.txt"),
    ),
  );
  assert.ok(fs.existsSync(path.join(resources, "licenses", "next.txt")));
  await page.locator(".sidebar").getByTitle("Usage", { exact: true }).click();
  await page.getByRole("heading", { name: "Usage & costs" }).waitFor();
  await page.screenshot({ path: "test-results/portable.png" });
  atomic("test-results/portable-results.json", {
    passed: true,
    executable,
    root,
    checkedAt: new Date().toISOString(),
  });
  console.log(
    "PASS: single-file portable extracts, starts the real app, keeps an empty workspace and opens the new Usage screen",
  );
} finally {
  if (browser) {
    const session = await browser.newBrowserCDPSession();
    await Promise.race([
      session.send("Browser.close").catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } else child.kill();
}

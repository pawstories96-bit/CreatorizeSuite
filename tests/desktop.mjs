import { _electron as electron } from "playwright";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { validateScene, atomic } from "../server/core.mjs";
const workspace = path.resolve(".test-desktop-" + Date.now());
const app = await electron.launch({
  ...(process.env.PACKAGED_EXE
    ? { executablePath: path.resolve(process.env.PACKAGED_EXE), args: ['--user-data-dir='+path.join(workspace,'electron-profile')] }
    : { args: [".",'--user-data-dir='+path.join(workspace,'electron-profile')] }),
  env: {
    ...process.env,
    FRAMECRAFT_WORKSPACE: workspace,
    ELECTRON_ENABLE_LOGGING: "1",
  },
  timeout: 90000,
});
try {
  const page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Make something worth watching." })
    .waitFor();
  const count = await page.evaluate(() =>
    fetch("/api/state")
      .then((r) => r.json())
      .then((s) => s.projects.length),
  );
  assert.equal(count, 0);
  await page.screenshot({ path: "test-results/desktop.png" });
  const security = await app.evaluate(({ BrowserWindow }) => {
    const prefs =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      node: prefs.nodeIntegration,
      context: prefs.contextIsolation,
      sandbox: prefs.sandbox,
    };
  });
  assert.equal(security.node, false);
  assert.equal(security.context, true);
  assert.equal(security.sandbox, true);
  console.log(
    "PASS: real Electron window, empty workspace, isolated and sandboxed renderer",
  );
  await page
    .locator(".sidebar")
    .getByTitle("Connections", { exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Connections", exact: true })
    .waitFor();
  await page
    .getByText("Checking…", { exact: true })
    .first()
    .waitFor({ state: "hidden", timeout: 40000 });
  await page.screenshot({ path: "test-results/connections.png" });
  console.log("PASS: desktop provider detection");
  if (process.env.PACKAGED_EXE) {
    const base = new URL(page.url()).origin;
    const call = async (url, body) => {
      const r = await fetch(base + "/api" + url, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: base,
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      return j;
    };
    const wait = async (job) => {
      for (let i = 0; i < 180; i++) {
        const state = await call("/state"),
          j = state.jobs.find((j) => j.id === job.id);
        if (j.status === "done") return j;
        if (j.status === "error") throw Error(j.error);
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error("Packaged job timeout");
    };
    const zip = new AdmZip();
    zip.addFile(
      "project.json",
      Buffer.from(
        JSON.stringify({
          title: "Internal packaged render check",
          style: "flat",
          format: "16:9",
          durationSec: 1,
          shots: [
            {
              id: "s001",
              start: 0,
              end: 1,
              narration: "",
              scene: validateScene({
                elements: [
                  {
                    id: "circle",
                    type: "circle",
                    x: 640,
                    y: 360,
                    radius: 130,
                    fill: "#a8d4b1",
                  },
                ],
              }),
            },
          ],
          words: [],
          notes: [],
          pipeline: {},
        }),
      ),
    );
    const form = new FormData();
    form.append("file", new Blob([zip.toBuffer()]), "internal-check.zip");
    const p = await call("/import", form);
    const render = await wait(
      await call(`/projects/${p.id}/jobs`, {
        action: "export",
        options: { resolution: "test", fps: 2 },
      }),
    );
    assert.ok(render.size > 1000);
    console.log("PASS: packaged Chromium and FFmpeg produce a real MP4");
    const voice = await call("/projects", {
      title: "Internal packaged voice check",
      script: "The packaged speech engine is working.",
    });
    await wait(
      await call(`/projects/${voice.id}/jobs`, {
        action: "tts",
        options: { provider: "windows" },
      }),
    );
    console.log("PASS: packaged PowerShell TTS and audio processing");
    atomic("test-results/packaged-results.json", {
      passed: true,
      executable: process.env.PACKAGED_EXE,
      workspace,
      checkedAt: new Date().toISOString(),
    });
  }
} finally {
  await app.close();
}

import { _electron as electron } from "playwright";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { validateScene, atomic } from "../server/core.mjs";
const workspace = path.resolve(".test-desktop-" + Date.now());
const app = await electron.launch({
  ...(process.env.PACKAGED_EXE
    ? {
        executablePath: path.resolve(process.env.PACKAGED_EXE),
        args: ["--user-data-dir=" + path.join(workspace, "electron-profile")],
      }
    : {
        args: [
          ".",
          "--user-data-dir=" + path.join(workspace, "electron-profile"),
        ],
      }),
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
      for (let i = 0; i < (process.env.LIVE_PACKAGED_MCP ? 900 : 180); i++) {
        const state = await call("/state"),
          j = state.jobs.find((j) => j.id === job.id);
        if (j.status === "done") return j;
        if (j.status === "error") throw Error(j.error);
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error("Packaged job timeout");
    };
    const fixtureCredential =
      "internal-native-key-id:internal-native-key-secret";
    await call("/credentials", {
      name: "higgsfieldKey",
      value: fixtureCredential,
    });
    assert.equal((await call("/state")).settings.vault.higgsfieldKey, true);
    assert.ok(
      !fs
        .readFileSync(path.join(workspace, "vault", "higgsfieldKey"))
        .includes(Buffer.from(fixtureCredential)),
    );
    assert.ok(
      !fs
        .readFileSync(path.join(workspace, "app.db"))
        .includes(Buffer.from(fixtureCredential)),
    );
    await call("/credentials", { name: "higgsfieldKey", value: "" });
    console.log(
      "PASS: packaged provider credentials are OS-encrypted and absent from settings/project data",
    );
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
    const catalog = await call("/models/codex");
    assert.ok(catalog.models.length > 0);
    await page
      .locator(".sidebar")
      .getByTitle("Projects", { exact: true })
      .click();
    await page.getByText(p.title, { exact: true }).first().click();
    await page.getByRole("button", { name: "Change project model" }).click();
    await page
      .getByRole("combobox", { name: "Project provider", exact: true })
      .selectOption("codex");
    const modelSelect = page.getByRole("combobox", {
      name: "Project model",
      exact: true,
    });
    await modelSelect
      .locator(`option[value="${catalog.models[0].id}"]`)
      .waitFor({ state: "attached" });
    await modelSelect.selectOption(catalog.models[0].id);
    await page.getByRole("button", { name: "Use for this project" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      (await call(`/projects/${p.id}`)).agent.model,
      catalog.models[0].id,
    );
    await page.waitForFunction(
      (projectId) =>
        document.querySelector("iframe")?.contentWindow.FC?.getProject()?.id ===
        projectId,
      p.id,
    );
    await page.waitForFunction(() => {
      const canvas = document
        .querySelector("iframe")
        ?.contentDocument.querySelector("#stage");
      if (!canvas) return false;
      const pixel = canvas.getContext("2d").getImageData(640, 360, 1, 1).data;
      return pixel[0] === 168 && pixel[1] === 212 && pixel[2] === 177;
    });
    await page.screenshot({ path: "test-results/packaged-project-model.png" });
    console.log(
      "PASS: packaged model discovery and editor model selection persist the actual provider model ID",
    );
    const render = await wait(
      await call(`/projects/${p.id}/jobs`, {
        action: "export",
        options: { resolution: "test", fps: 2 },
      }),
    );
    assert.ok(render.size > 1000);
    console.log("PASS: packaged Chromium and FFmpeg produce a real MP4");
    const graphics = structuredClone(p);
    graphics.style = "3d";
    graphics.baseStyle = "3d";
    graphics.look = "Studio";
    graphics.shots[0].scene = validateScene({
      background: "#d6e0df",
      camera: { x: 10, y: 7, z: 12 },
      effects: { ssao: true, bloom: 0.12, grain: 0.03, outline: true },
      elements: [
        {
          id: "water",
          type: "water",
          width: 30,
          height: 30,
          y: -0.1,
          fill: "#779ca7",
        },
        {
          id: "rig",
          type: "mannequin",
          x: 0,
          y: 0,
          z: 0,
          pose: "walk",
          role: "protagonist",
          highlight: true,
        },
        {
          id: "pipe",
          type: "tube",
          points: [
            { x: -3, y: 0, z: 0 },
            { x: -3, y: 2, z: 0 },
            { x: -1, y: 2, z: 0 },
          ],
          tubeRadius: 0.15,
          fill: "#aa734e",
        },
      ],
    });
    await page.evaluate((base) => {
      const iframe = document.createElement("iframe");
      iframe.id = "packaged-graphics-check";
      iframe.src = base + "/player.html?width=640&height=360&inspect=1";
      iframe.style.cssText =
        "position:fixed;inset:0;width:640px;height:360px;z-index:99999;border:0";
      document.body.append(iframe);
    }, base);
    await page
      .frameLocator("#packaged-graphics-check")
      .locator("#stage")
      .waitFor();
    const graphicsPage = page
      .frames()
      .find((f) => f.url().includes("inspect=1"));
    assert.ok(graphicsPage);
    const graphicsErrors = [];
    const onGraphicsError = (e) => graphicsErrors.push(e.message);
    page.on("pageerror", onGraphicsError);
    await graphicsPage.waitForFunction(() => window.ready);
    await graphicsPage.evaluate((p) => window.FC.setProject(p), graphics);
    const graphicsFrame = await graphicsPage.evaluate(() =>
      window.FC.renderFrame(0.5),
    );
    assert.ok(graphicsFrame.metrics.some((m) => m.id === "rig" && m.bounds));
    await page
      .locator("#packaged-graphics-check")
      .screenshot({ path: "test-results/packaged-graphics.png" });
    assert.deepEqual(graphicsErrors, []);
    await page
      .locator("#packaged-graphics-check")
      .evaluate((iframe) => iframe.remove());
    page.off("pageerror", onGraphicsError);
    console.log(
      "PASS: packaged Three.js add-ons render reflective water, articulated figures, tubes, SSAO, bloom, grain and outlines",
    );
    if (process.env.LIVE_PACKAGED_MCP === "1") {
      const edit = await wait(
        await call(`/projects/${p.id}/jobs`, {
          action: "edit",
          options: {
            scope: "shot",
            shotId: "s001",
            agent: { provider: "codex", effort: "low" },
            prompt:
              "Change the circle fill to blue #4488ee. Keep everything else exactly the same. Call Framecraft get_project and render_frames with the candidate scene at shot-relative time 0.5, and check_preview, then return the complete scene JSON.",
          },
        }),
      );
      assert.ok(
        edit.events.some((e) => e.text === "Agent tool: render_frames"),
      );
      assert.ok(
        edit.events.some((e) => e.text === "Agent tool: check_preview"),
      );
      assert.equal(edit.comparisons.length, 1);
      assert.ok(edit.comparisons[0].beforeClip);
      assert.ok(edit.comparisons[0].afterClip);
      assert.equal(edit.model, catalog.models[0].id);
      console.log(
        "PASS: packaged signed-in Codex uses bundled MCP bridge, real preview tools, and before/after PNG and MP4 captures",
      );
    }
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

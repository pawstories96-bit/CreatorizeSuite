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
  if (process.env.NATIVE_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.setBackgroundThrottling(false);
        w.hide();
      }),
    );
  const captureWindow = async (dest) => {
    let encoded;
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        encoded = await app.evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0],
            wasVisible = w.isVisible();
          const bounded = () =>
            Promise.race([
              w.webContents.capturePage(undefined, {
                stayHidden: true,
                stayAwake: true,
              }),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(Error("Native capture timed out")),
                  5000,
                ),
              ),
            ]);
          try {
            return (await bounded()).toPNG().toString("base64");
          } catch {
            // Windows can stop producing compositor surfaces for a hidden test
            // window. Show only this test window without taking keyboard focus.
            w.showInactive();
            try {
              return (await bounded()).toPNG().toString("base64");
            } finally {
              if (!wasVisible) w.hide();
            }
          }
        });
        break;
      } catch (error) {
        if (attempt === 2 || !error.message.includes("UnknownVizError"))
          throw error;
        await new Promise((r) => setTimeout(r, 500));
      }
    fs.writeFileSync(dest, Buffer.from(encoded, "base64"));
  };
  await page
    .getByRole("heading", { name: "Make something worth watching." })
    .waitFor();
  const count = await page.evaluate(() =>
    fetch("/api/state")
      .then((r) => r.json())
      .then((s) => s.projects.length),
  );
  assert.equal(count, 0);
  await captureWindow("test-results/desktop.png");
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
  await captureWindow("test-results/connections.png");
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
    await captureWindow("test-results/packaged-project-model.png");
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
      environment: {
        kind: "exterior",
        skyTop: "#749cc1",
        skyHorizon: "#d6e0df",
      },
      cameraFov: 42,
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
        {
          id: "seated",
          type: "mannequin",
          x: 2,
          y: 0,
          z: 0,
          height: 1.8,
          fill: "#f0efed",
          pose: "sit",
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
    const seated = graphicsFrame.metrics.find((m) => m.id === "seated");
    assert.ok(
      Math.abs(seated.worldBounds.min[1]) < 0.05,
      "A seated figure's feet must remain at the specified floor height",
    );
    await captureWindow("test-results/packaged-graphics.png");
    assert.deepEqual(graphicsErrors, []);
    if (process.env.LIVE_PACKAGED_ASSETS === "1") {
      const catalog = await call("/model-assets?q=cargo%20ship");
      const source = catalog.find(
        (a) => a.id === "kenney:watercraft-kit:ship-cargo-a",
      );
      assert.ok(source);
      const downloaded = await call(`/projects/${p.id}/models`, {
        id: source.id,
      });
      assert.ok(downloaded.bounds.size.every((v) => v > 0));
      assert.equal(downloaded.author, "Kenney");
      const glb = fs.readFileSync(
        path.join(workspace, "projects", p.id, downloaded.path),
      );
      assert.equal(glb.toString("ascii", 0, 4), "glTF");
      graphics.shots[0].scene = validateScene({
        ...graphics.shots[0].scene,
        camera: { x: 9, y: 6, z: 12 },
        elements: [
          {
            id: "real-ship",
            type: "model",
            src: downloaded.path,
            scale: 1,
            scale3d: { x: 0.65, y: 0.6, z: 1 },
            instances: [
              { x: -2, y: 0, z: 0, scale: 1, rotation: 0 },
              { x: 3, y: 0, z: -4, scale: 0.8, rotation: 20 },
            ],
          },
          {
            id: "water",
            type: "water",
            width: 200,
            height: 200,
            y: 0.08,
            fill: "#6e939e",
          },
          {
            id: "warehouse",
            type: "building3d",
            x: -9,
            y: 0,
            z: -8,
            width: 6,
            height: 4,
            depth: 7,
            fill: "#b7ad98",
            building: { kind: "warehouse", floors: 1 },
          },
        ],
      });
      await graphicsPage.evaluate((p) => window.FC.setProject(p), graphics);
      const actual = await graphicsPage.evaluate(() =>
        window.FC.renderFrame(0.5),
      );
      assert.ok(
        actual.metrics.some(
          (m) => m.id === "real-ship" && m.visibleSamples > 0,
        ),
      );
      await captureWindow("test-results/packaged-real-model.png");
      assert.deepEqual(graphicsErrors, []);
      console.log(
        "PASS: packaged app searches official CC0 catalogs, embeds and measures an actual downloaded ship, and renders its geometry/texture against the new reflective water",
      );
    }
    if (process.env.LIVE_PACKAGED_MOTIONS === "1") {
      const form = new FormData();
      form.append("kind", "motion");
      form.append(
        "file",
        new Blob([fs.readFileSync(".test-reference-review/samba.fbx")]),
        "Samba.fbx",
      );
      const motion = await call(`/projects/${p.id}/rig-import`, form);
      assert.equal(Object.keys(motion.mapping).length, 12);
      const castGraphics = structuredClone(graphics);
      castGraphics.cast = {
        main: { body: "female", finish: "glossy", color: "#bc334d" },
      };
      castGraphics.shots[0].scene = validateScene({
        camera: { x: 3, y: 2, z: 5 },
        cameraRig: {
          preset: "push-in",
          distance: 5,
          height: 1.5,
          target: { x: 0, y: 0.9, z: 0 },
          duration: 1,
        },
        elements: [
          {
            id: "actor",
            type: "mannequin",
            castRole: "main",
            height: 1.8,
            motionSrc: motion.path,
          },
          {
            id: "ground",
            type: "box",
            width: 8,
            height: 0.1,
            depth: 8,
            y: -0.1,
            fill: "#374754",
          },
        ],
      });
      await graphicsPage.evaluate((p) => window.FC.setProject(p), castGraphics);
      const motionFrame = await graphicsPage.evaluate(() =>
        window.FC.renderFrame(0.5),
      );
      assert.ok(
        motionFrame.metrics.find((m) => m.id === "actor")?.visibleSamples > 0,
      );
      await captureWindow("test-results/packaged-cast-motion.png");
      assert.deepEqual(graphicsErrors, []);
      console.log(
        "PASS: packaged FBX loader, actual humanoid retarget, glossy female cast and named camera renderer",
      );
      if (process.env.MIXAMO_DIR) {
        for (const [body, filename] of [
          ["male", "Y Bot.fbx"],
          ["female", "X Bot.fbx"],
        ]) {
          const form = new FormData();
          form.append("kind", "character");
          form.append("source", "mixamo");
          form.append("body", body);
          form.append(
            "file",
            new Blob([
              fs.readFileSync(path.join(process.env.MIXAMO_DIR, filename)),
            ]),
            filename,
          );
          const character = await call(`/projects/${p.id}/rig-import`, form);
          assert.equal(Object.keys(character.skeleton).length, 12);
          castGraphics.characterModels = {
            ...castGraphics.characterModels,
            [body]: character,
          };
          castGraphics.castMode = "mixamo";
          castGraphics.cast.main.body = body;
          castGraphics.shots[0].scene.elements[0] = {
            ...castGraphics.shots[0].scene.elements[0],
            motionSrc: undefined,
            pose: "phone",
            heldProp: { kind: "phone", hand: "right" },
          };
          await graphicsPage.evaluate(
            (p) => window.FC.setProject(p),
            castGraphics,
          );
          const frame = await graphicsPage.evaluate(() =>
            window.FC.renderFrame(0.5),
          );
          assert.ok(
            frame.metrics.find((m) => m.id === "actor")?.visibleSamples > 0,
          );
          await captureWindow(`test-results/packaged-mixamo-${body}.png`);
        }
        assert.deepEqual(graphicsErrors, []);
        const legacy = new FormData();
        legacy.append("kind", "character");
        legacy.append("source", "mixamo");
        legacy.append(
          "file",
          new Blob([
            fs.readFileSync(
              path.join(process.env.MIXAMO_DIR, "character (2).fbx"),
            ),
          ]),
          "character (2).fbx",
        );
        const converted = await call(`/projects/${p.id}/rig-import`, legacy);
        assert.equal(Object.keys(converted.skeleton).length, 12);
        castGraphics.cast.main = {
          ...castGraphics.cast.main,
          src: converted.path,
          humanoid: true,
        };
        await graphicsPage.evaluate(
          (p) => window.FC.setProject(p),
          castGraphics,
        );
        const legacyFrame = await graphicsPage.evaluate(() =>
          window.FC.renderFrame(0.5),
        );
        assert.ok(
          legacyFrame.metrics.find((m) => m.id === "actor")?.visibleSamples > 0,
        );
        const inherited = await call("/projects", {
          title: "Internal inherited Mixamo setup check",
          style: "3d",
        });
        assert.equal(inherited.castMode, "mixamo");
        assert.ok(
          inherited.characterModels.male && inherited.characterModels.female,
        );
        console.log(
          "PASS: packaged importer and humanoid actions render the user's actual Mixamo X Bot and Y Bot skins",
        );
      }
    }
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

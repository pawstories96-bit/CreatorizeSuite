import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { atomic, uid, run, validateScene } from "../server/core.mjs";
import AdmZip from "adm-zip";
const root = path.resolve(".test-portable-" + uid());
const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const executable = path.resolve(
  process.env.PACKAGED_EXE || "release/v0.3.2/Creatorize Suite 0.3.2.exe",
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
  if (process.env.MIXAMO_DIR) {
    const base = new URL(page.url()).origin;
    const call = async (url, body) => {
      const response = await fetch(base + "/api" + url, {
        method: "POST",
        headers: {
          Origin: base,
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
    const p = await call("/projects", {
        title: "Internal portable Mixamo export check",
        style: "3d",
        castMode: "mixamo",
      }),
      bodies = {};
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
      bodies[body] = await call(`/projects/${p.id}/rig-import`, form);
    }
    const manifest = {
      ...p,
      characterModels: bodies,
      durationSec: 1,
      cast: { main: { body: "female", finish: "glossy", color: "#bd3653" } },
      shots: [
        {
          id: "s001",
          start: 0,
          end: 1,
          scene: validateScene({
            camera: { x: 2.5, y: 1.6, z: 4 },
            cameraRig: {
              target: { x: 0, y: 0.85, z: 0 },
              type: "dolly",
              duration: 1,
            },
            elements: [
              {
                id: "actor",
                type: "mannequin",
                castRole: "main",
                height: 1.8,
                pose: "phone",
                heldProp: { kind: "phone", hand: "right" },
              },
              {
                id: "floor",
                type: "box",
                width: 8,
                height: 0.1,
                depth: 8,
                y: -0.06,
                fill: "#424b52",
              },
            ],
          }),
        },
      ],
    };
    const zip = new AdmZip();
    zip.addFile("project.json", Buffer.from(JSON.stringify(manifest)));
    for (const record of Object.values(bodies))
      zip.addLocalFile(
        path.join(root, "projects", p.id, record.path),
        "assets",
      );
    const form = new FormData();
    form.append("file", new Blob([zip.toBuffer()]), "internal-mixamo.zip");
    const imported = await call("/import", form),
      job = await call(`/projects/${imported.id}/jobs`, {
        action: "export",
        options: { resolution: "test", fps: 2 },
      });
    let final;
    for (let i = 0; i < 180; i++) {
      const state = await fetch(base + "/api/state").then((r) => r.json());
      final = state.jobs.find((j) => j.id === job.id);
      if (final.status === "error") throw Error(final.error);
      if (final.status === "done") break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(final.status, "done");
    assert.ok(final.size > 1000);
    const exported = path.join(root, "projects", imported.id, final.output);
    const probe = await run(path.join(resources, "ffmpeg", "ffprobe.exe"), [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_frames",
      "-of",
      "json",
      exported,
    ]);
    assert.equal(Number(JSON.parse(probe.stdout).streams[0].nb_frames), 2);
    atomic("test-results/portable-mixamo-export.json", {
      passed: true,
      exported,
      size: final.size,
    });
    console.log(
      "PASS: portable imports actual X/Y Bot FBX skins, restores character assets through ZIP, and exports a real two-frame Mixamo MP4",
    );
  }
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

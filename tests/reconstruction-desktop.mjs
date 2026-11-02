import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { uid, run } from "../server/core.mjs";
const root = path.resolve(".test-reconstruction-desktop-" + uid());
const app = await electron.launch({
  executablePath: path.resolve(
    process.env.PACKAGED_EXE ||
      "release/v0.3.3/win-unpacked/Creatorize Suite.exe",
  ),
  args: ["--user-data-dir=" + path.join(root, "profile")],
  env: {
    ...process.env,
    FRAMECRAFT_WORKSPACE: root,
    CREATORIZE_WORKSPACE: root,
  },
  timeout: 90000,
});
let diagnostics = "";
app
  .process()
  .stderr?.on(
    "data",
    (chunk) => (diagnostics = (diagnostics + chunk).slice(-12000)),
  );
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.setBackgroundThrottling(false);
      w.hide();
    }),
  );
  await page.waitForURL(/127\.0\.0\.1/);
  const base = new URL(page.url()).origin,
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const call = async (url, body, method = body ? "POST" : "GET") => {
    const res = await fetch(base + "/api" + url, {
      method,
      headers: {
        Origin: base,
        Connection: "close",
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
    const data = await res.json();
    assert.ok(res.ok, data.error);
    return data;
  };
  assert.equal((await call("/state")).projects.length, 0);
  const fixture = await call("/styles/3d/preview?look=White%20clay");
  fixture.title = "Internal packaged reconstruction check";
  fixture.durationSec = 0.4;
  fixture.shots[0].end = 0.4;
  const zip = new AdmZip();
  zip.addFile("project.json", Buffer.from(JSON.stringify(fixture)));
  const form = new FormData();
  form.append("file", new Blob([zip.toBuffer()]), "internal-kit-check.zip");
  const p = await call("/import", form);
  await page
    .locator(".sidebar")
    .getByTitle("Projects", { exact: true })
    .click();
  await page.getByText(p.title, { exact: true }).first().click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('iframe[title="Video preview"]')
        ?.contentWindow.FC?.getProject()?.id === id,
    p.id,
  );
  const frame = page.frames().find((f) => f.url().includes("/player.html"));
  await frame.waitForFunction(
    () => window.FC.getRenderStats()?.triangles > 1000,
  );
  const capture = async (name) => {
    const encoded = await frame.evaluate(async () => {
      await window.FC.renderFrame(0.1);
      return document
        .querySelector("#stage")
        .toDataURL("image/png")
        .split(",")[1];
    });
    fs.writeFileSync("test-results/" + name, Buffer.from(encoded, "base64"));
    return encoded;
  };
  const clay = await capture("reconstruction-packaged-clay.png");
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Reconstruction look" })
    .selectOption("Golden hour");
  await page
    .getByRole("button", { name: "Apply to project", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await frame.waitForFunction(
    () => window.FC.getProject()?.look === "Golden hour",
  );
  const golden = await capture("reconstruction-packaged-golden.png");
  assert.notEqual(clay, golden);
  assert.equal((await call("/projects/" + p.id)).look, "Golden hour");
  // Reload the UI and confirm persistence without touching any real project.
  await page.reload();
  await page.getByRole("button", { name: "Style", exact: true }).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Reconstruction look" })
      .inputValue(),
    "Golden hour",
  );
  await page
    .getByRole("button", { name: "Apply to project", exact: true })
    .click();
  // Exercise every built-in look preview from the shipped app and its local map dependencies.
  console.log(
    "PASS: packaged cockpit, in-project look change and reload persistence",
  );
  const preview = page;
  await preview.goto(base + "/player.html?width=960&height=540");
  await preview.waitForFunction(() => window.ready);
  for (const look of [
    "White clay",
    "Daylight",
    "Golden hour",
    "Dusk",
    "Night",
    "Overcast",
    "Dark map",
    "Mechanism studio",
  ]) {
    const project = await call(
      "/styles/3d/preview?look=" + encodeURIComponent(look),
    );
    await preview.evaluate((p) => window.FC.setProject(p), project);
    await preview.evaluate(() => window.FC.renderFrame(2));
    assert.ok(
      (await preview.evaluate(() => window.FC.getRenderStats())).triangles >
        500,
    );
    const png = await preview.evaluate(
      () =>
        document.querySelector("#stage").toDataURL("image/png").split(",")[1],
    );
    fs.writeFileSync(
      "test-results/reconstruction-look-" + look.replaceAll(" ", "-") + ".png",
      Buffer.from(png, "base64"),
    );
  }
  // Persisted project still exports through the native app's bundled browser/FFmpeg.
  const job = await call("/projects/" + p.id + "/jobs", {
    action: "export",
    options: { resolution: "test", fps: 10, autoHeal: false },
  });
  let completed;
  for (let i = 0; i < 240; i++) {
    completed = (await call("/state")).jobs.find((j) => j.id === job.id);
    if (["done", "error"].includes(completed.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(completed.status, "done", completed.error);
  const saved = await call("/projects/" + p.id),
    file = path.join(root, "projects", p.id, saved.lastExport);
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_read_frames",
        "-of",
        "json",
        file,
      ])
    ).stdout,
  );
  assert.equal(Number(probe.streams[0].nb_read_frames), 4);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-results/reconstruction-desktop-results.json",
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        root,
        export: file,
        probe,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: packaged empty startup, detailed cockpit, persisted in-project look selection, eight previews, bundled maps and actual MP4 export",
  );
} catch (error) {
  console.error("Native test diagnostic", app.process().exitCode, diagnostics);
  throw error;
} finally {
  await app.close();
}

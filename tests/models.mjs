import assert from "node:assert/strict";
import http from "node:http";
import AdmZip from "adm-zip";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";
import { uid, atomic } from "../server/core.mjs";
import {
  resolveAgentRoute,
  snapshotAgentSettings,
} from "../server/agent-routing.mjs";
const service = await startServer({
  root: path.resolve(".test-models-" + uid()),
  port: 0,
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const call = async (url, method = "GET", body) => {
  const r = await fetch(service.url + "/api" + url, {
    method,
    headers: { Origin: service.url, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
};
const wait = async (id) => {
  for (let i = 0; i < 200; i++) {
    const job = service.store.get("jobs", id);
    if (["done", "error"].includes(job.status)) {
      assert.equal(job.status, "done", job.error);
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Job timeout");
};
let fixture, release;
try {
  const [codex, claude] = await Promise.all([
    call("/models/codex"),
    call("/models/claude"),
  ]);
  assert.ok(codex.models.length > 0);
  assert.ok(codex.models.every((m) => m.id && m.name));
  assert.ok(claude.models.length > 0);
  console.log(
    "PASS: live Codex and Claude catalogs discovered without an inference call",
    codex.models.length,
    claude.models.length,
  );
  const p = await service.store.create({
    title: "Internal model picker verification",
    script: "The sky is blue.",
  });
  const untouched = await service.store.create({
    title: "Internal independent project",
  });
  await page.goto(service.url);
  await page.getByText(p.title, { exact: true }).first().click();
  await page.getByRole("heading", { name: p.title }).waitFor();
  await page.getByRole("button", { name: "Change project model" }).click();
  await page
    .getByRole("combobox", { name: "Project provider", exact: true })
    .selectOption("codex");
  const chooser = page.getByRole("combobox", {
    name: "Project model",
    exact: true,
  });
  await chooser
    .locator(`option[value="${codex.models[0].id}"]`)
    .waitFor({ state: "attached" });
  await chooser.selectOption(codex.models[0].id);
  const effort = codex.models[0].efforts.at(-1);
  if (effort)
    await page
      .getByRole("combobox", { name: "Thinking effort" })
      .selectOption(effort);
  await page.screenshot({ path: "test-results/model-picker.png" });
  await page.getByRole("button", { name: "Use for this project" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await call(`/projects/${p.id}`)).agent.model,
    codex.models[0].id,
  );
  assert.equal((await call(`/projects/${untouched.id}`)).agent, null);
  await page.reload();
  await page.getByRole("button", { name: "Change project model" }).click();
  await page
    .getByRole("combobox", { name: "Project model", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Project model", exact: true })
      .inputValue(),
    codex.models[0].id,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .locator(".sidebar")
    .getByTitle("Connections", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Model", exact: true })
    .locator(`option[value="${codex.models[0].id}"]`)
    .waitFor({ state: "attached" });
  console.log(
    "PASS: friendly model selection in editor and Connections; per-project persistence and isolation",
  );
  const duplicated = await call(`/projects/${p.id}/duplicate`, "POST", {});
  assert.equal(
    (await call(`/projects/${duplicated.id}`)).agent.model,
    codex.models[0].id,
  );
  const archive = Buffer.from(
    await (
      await fetch(service.url + `/api/projects/${p.id}/zip`)
    ).arrayBuffer(),
  );
  const manifest = JSON.parse(new AdmZip(archive).readAsText("project.json"));
  assert.equal(manifest.agent.model, codex.models[0].id);
  const form = new FormData();
  form.append("file", new Blob([archive]), "internal-model-roundtrip.zip");
  const importedResponse = await fetch(service.url + "/api/import", {
    method: "POST",
    headers: { Origin: service.url },
    body: form,
  });
  const imported = await importedResponse.json();
  assert.equal(importedResponse.status, 200, imported.error);
  assert.equal(
    (await call(`/projects/${imported.id}`)).agent.model,
    codex.models[0].id,
  );
  console.log(
    "PASS: model choice follows project duplication and ZIP export/import",
  );

  // A local protocol fixture checks exact selected model IDs and frozen running jobs.
  const modelsSeen = [];
  const catalogAuth = [];
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  fixture = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      catalogAuth.push(req.headers.authorization || null);
      res.end(
        JSON.stringify({
          data: [
            { id: "fixture-model-a", name: "Fixture A" },
            { id: "fixture-model-b", name: "Fixture B" },
          ],
        }),
      );
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    modelsSeen.push(body.model);
    if (modelsSeen.length === 1) {
      markStarted();
      await held;
    }
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                titles: ["Title"],
                description: "Description",
                tags: ["tag"],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
    );
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  await call("/settings", "POST", {
    provider: "local",
    localModel: "workspace-default",
    localUrl: `http://127.0.0.1:${fixture.address().port}/v1`,
  });
  const local = await call("/models/local");
  assert.equal(local.models[1].id, "fixture-model-b");
  await service.vault.set("apiKey", "internal-protocol-fixture-key");
  await call("/settings", "POST", {
    apiUrl: `http://127.0.0.1:${fixture.address().port}/v1`,
  });
  const apiCatalog = await call("/models/api");
  assert.equal(apiCatalog.models.length, 2);
  assert.equal(catalogAuth.at(-1), "Bearer internal-protocol-fixture-key");
  await assert.rejects(
    call(
      "/models/api?endpoint=" +
        encodeURIComponent("https://unconfigured.invalid/v1"),
    ),
    /Save the API endpoint/,
  );
  console.log(
    "PASS: compatible API discovery authenticates only to its configured endpoint",
  );
  await call(`/projects/${p.id}/agent`, "POST", {
    agent: { provider: "local", model: "fixture-model-a", effort: "" },
  });
  const first = service.pipeline.enqueue(p.id, "metadata");
  await started;
  await call(`/projects/${p.id}/agent`, "POST", {
    agent: { provider: "local", model: "fixture-model-b", effort: "" },
  });
  const second = service.pipeline.enqueue(p.id, "metadata");
  await call(`/projects/${p.id}/agent`, "POST", {
    agent: { provider: "local", model: "changed-after-enqueue", effort: "" },
  });
  release();
  const firstDone = await wait(first.id),
    secondDone = await wait(second.id);
  assert.deepEqual(modelsSeen, ["fixture-model-a", "fixture-model-b"]);
  assert.equal(firstDone.model, "fixture-model-a");
  assert.equal(secondDone.model, "fixture-model-b");
  assert.equal((await call("/state")).settings.localModel, "workspace-default");
  assert.deepEqual(
    resolveAgentRoute(
      { provider: "codex", model: "codex-model", effort: "medium" },
      "build",
      { provider: "claude", model: "", effort: "" },
    ),
    { provider: "claude", model: "", effort: "" },
  );
  const recoveredSnapshot = JSON.parse(
    JSON.stringify(
      snapshotAgentSettings({
        provider: "codex",
        model: "original",
        effort: "",
      }),
    ),
  );
  assert.deepEqual(
    resolveAgentRoute(
      {
        roles: { build: { provider: "claude", model: "new-role" } },
        ...recoveredSnapshot,
      },
      "build",
    ),
    { provider: "codex", model: "original", effort: "" },
  );
  console.log(
    "PASS: running and queued jobs preserve model snapshots; new jobs use the new selection without leaking models across providers",
  );
  assert.deepEqual(errors, []);
  assert.equal(
    resolveAgentRoute(
      {
        provider: "claude",
        roles: { qa: { provider: "codex", model: "reviewer" } },
      },
      "qa",
      { provider: "claude", model: "builder" },
    ).model,
    "reviewer",
  );
  console.log(
    "PASS: an explicit QA role stays independent of the project's builder",
  );
  atomic("test-results/model-results.json", {
    passed: true,
    codexModels: codex.models.length,
    claudeModels: claude.models.length,
    selected: codex.models[0].id,
    modelsSeen,
    checkedAt: new Date().toISOString(),
  });
} finally {
  release?.();
  await browser.close();
  await service.close();
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
}

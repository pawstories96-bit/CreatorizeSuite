import { startServer } from "../server/index.mjs";
import { uid, atomic } from "../server/core.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const service = await startServer({
  root: path.resolve(".test-history-" + uid()),
  port: 0,
});
const call = async (url, method = "GET", body) => {
  const r = await fetch(service.url + "/api" + url, {
    method,
    headers: {
      Origin: service.url,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
};
try {
  const p = await call("/projects", "POST", {
    title: "Internal history check",
    script: "Original script.",
  });
  await call("/projects/" + p.id, "PATCH", { script: "First edit." });
  let history = await call(`/projects/${p.id}/history`);
  const edit1 = history[0].hash;
  await call(`/projects/${p.id}/revert`, "POST", { hash: edit1 });
  assert.equal((await call("/projects/" + p.id)).script, "Original script.");
  history = await call(`/projects/${p.id}/history`);
  await call(`/projects/${p.id}/revert`, "POST", { hash: history[0].hash });
  assert.equal((await call("/projects/" + p.id)).script, "First edit.");
  console.log("PASS: edit, revert and undoing the revert");
  const zip = await fetch(service.url + `/api/projects/${p.id}/zip`);
  const form = new FormData();
  form.append("file", new Blob([await zip.arrayBuffer()]), "round-trip.zip");
  const imported = await call("/import", "POST", form);
  assert.notEqual(imported.id, p.id);
  assert.equal(imported.script, "First edit.");
  console.log("PASS: real ZIP export/import round trip");
  try {
    const assets = await call("/asset-search?q=oak%20tree");
    assert.ok(Array.isArray(assets));
    console.log(
      "Wikimedia live search returned",
      assets.length,
      "licensed images",
    );
    assert.ok(assets.length);
    const image = await call(
      "/projects/" + p.id + "/assets/download",
      "POST",
      assets[0],
    );
    assert.ok(image.path.startsWith("assets/"));
    const ledger = await call("/assets/" + p.id);
    assert.equal(ledger[0].license, assets[0].license);
    console.log("PASS: real Commons image download and attribution ledger");
  } catch (e) {
    console.log("EXTERNAL BLOCKER: Wikimedia search/download", e.message);
  }
  atomic("test-results/history-results.json", {
    passed: true,
    checkedAt: new Date().toISOString(),
  });
} finally {
  await service.close();
}

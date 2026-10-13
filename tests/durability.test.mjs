import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Store, uid } from "../server/core.mjs";
import { Pipeline } from "../server/pipeline.mjs";
import { normalizeLicense } from "../server/assets.mjs";
const wait = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    const r = predicate();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Timed out");
};
test("license normalization never upgrades noncommercial or no-derivatives media", () => {
  assert.equal(normalizeLicense("CC BY-NC 4.0"), null);
  assert.equal(normalizeLicense("CC BY-ND 4.0"), null);
  assert.equal(normalizeLicense("CC BY-SA 4.0"), "CC-BY-SA-4.0");
  assert.equal(normalizeLicense("Public domain"), "public domain");
  assert.equal(normalizeLicense("CC0"), "CC0");
});
test("routine approval persists child completion and continues without replaying completed nodes", async () => {
  const store = await new Store().init(path.resolve(".test-durable-" + uid()));
  const p = await store.create({ title: "Internal durable test" });
  const pipeline = new Pipeline(store, null, null);
  let calls = [];
  const real = pipeline.execute.bind(pipeline);
  pipeline.execute = async (job) => {
    if (job.action === "routine") return real(job);
    calls.push(job.action);
  };
  store.put("routines", {
    id: "r",
    name: "Checkpoint test",
    projectId: p.id,
    nodes: [
      { id: "a", data: { action: "script", label: "Script" } },
      { id: "b", data: { action: "approval", label: "Approval" } },
      { id: "c", data: { action: "export", label: "Export" } },
      { id: "d", data: { action: "approval", label: "Second approval" } },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
    ],
  });
  const j = pipeline.enqueue(p.id, "routine", { routineId: "r" });
  await wait(() => store.get("jobs", j.id)?.status === "waiting");
  assert.deepEqual(calls, ["script"]);
  const saved = store.get("jobs", j.id);
  assert.equal(saved.checkpoint, 1);
  assert.equal(store.get("jobs", saved.childJobs.a).status, "done");
  saved.options.approved = true;
  store.put("jobs", saved);
  await wait(() => !pipeline.active.size);
  pipeline.resume(j.id);
  await wait(
    () =>
      store.get("jobs", j.id)?.status === "waiting" &&
      store.get("jobs", j.id).checkpoint === 3,
  );
  const second = store.get("jobs", j.id);
  second.approvedCheckpoints = [3];
  store.put("jobs", second);
  await wait(() => !pipeline.active.size);
  pipeline.resume(j.id);
  await wait(() => store.get("jobs", j.id)?.status === "done");
  assert.deepEqual(calls, ["script", "export"]);
  assert.equal(store.get("jobs", j.id).error, undefined);
});
test("startup requeues interrupted jobs while leaving stopped jobs stopped", async () => {
  const store = await new Store().init(path.resolve(".test-recovery-" + uid()));
  const pipeline = new Pipeline(store, null, null);
  let ran = [];
  pipeline.execute = async (j) => ran.push(j.id);
  store.put("jobs", {
    id: "interrupted",
    action: "test",
    status: "running",
    events: [],
    options: {},
  });
  store.put("jobs", {
    id: "stopped",
    action: "test",
    status: "stopped",
    events: [],
    options: {},
  });
  pipeline.recover();
  await wait(() => store.get("jobs", "interrupted")?.status === "done");
  assert.deepEqual(ran, ["interrupted"]);
  assert.equal(store.get("jobs", "stopped").status, "stopped");
});

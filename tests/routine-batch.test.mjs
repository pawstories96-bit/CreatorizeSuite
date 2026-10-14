import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Store, uid } from "../server/core.mjs";
import { Pipeline } from "../server/pipeline.mjs";

test("a batch budget pause resumes at its saved topic after the parent limit is raised", async () => {
  const store = await new Store().init(path.resolve(".test-batch-budget-" + uid()));
  let calls = 0;
  const pipeline = new Pipeline(store, { generate: async ({ job }) => {
    calls++;
    job.runs = [{ provider: "api", model: "m", usage: { input_tokens: 100, output_tokens: 10 }, estimatedCost: 0.1 }];
    job.estimatedCost = 0.1;
    return { title: `Budget topic ${calls}`, topic: `Budget topic ${calls}` };
  } }, {});
  pipeline.suspended = true;
  const routine = { id: uid(), topicsPerRun: 2, maxCost: 0.05, nodes: [
    { id: "topics", data: { action: "topics" } }, { id: "create", data: { action: "create" } },
  ], edges: [{ source: "topics", target: "create" }] };
  store.put("routines", routine);
  const job = pipeline.enqueue(null, "routine", { routineId: routine.id });
  await assert.rejects(pipeline.routine(job), /budget checkpoint/);
  assert.equal(job.budgetBlocked, true);
  assert.equal(calls, 1);
  assert.equal(store.all("projects").length, 0);
  pipeline.persist(job); // The queue persists the parent after its failed execute call.
  store.put("routines", { ...routine, maxCost: 0.5 });
  const resumed = pipeline.resume(job.id);
  await pipeline.routine(resumed);
  assert.equal(calls, 2);
  assert.equal(store.all("projects").length, 2);
});
test("multi-topic routine saves independent projects, approvals and restart checkpoints", async () => {
  const store = await new Store().init(path.resolve(".test-batch-" + uid()));
  let topics = 0,
    uploads = 0;
  const pipeline = new Pipeline(
    store,
    {
      generate: async () => ({
        title: `Topic ${++topics}`,
        topic: `Topic ${topics}`,
        angle: "Original",
      }),
    },
    {},
  );
  pipeline.uploadVideo = async () => ({ id: `upload-${++uploads}` });
  const routine = {
    id: "batch",
    name: "Batch",
    topicsPerRun: 2,
    nodes: ["topics", "create", "approval", "upload"].map((action, i) => ({
      id: String(i),
      data: { action, label: action },
    })),
    edges: [
      { source: "0", target: "1" },
      { source: "1", target: "2" },
      { source: "2", target: "3" },
    ],
  };
  store.put("routines", routine);
  const job = {
    id: uid(),
    action: "routine",
    options: { routineId: routine.id },
    status: "running",
    events: [],
    checkpoint: 0,
  };
  await assert.rejects(pipeline.routine(job), /approval/i);
  assert.equal(store.all("projects").length, 1);
  assert.equal(uploads, 0);
  let child = store.get("jobs", job.waitingChild);
  child.approvedCheckpoints = [2];
  store.put("jobs", child);
  job.status = "running";
  await assert.rejects(pipeline.routine(job), /approval/i);
  assert.equal(store.all("projects").length, 2);
  assert.equal(topics, 2);
  assert.equal(uploads, 1);
  child = store.get("jobs", job.waitingChild);
  child.approvedCheckpoints = [2];
  store.put("jobs", child);
  job.status = "running";
  await pipeline.routine(job);
  assert.equal(uploads, 2);
  assert.equal(topics, 2);
  assert.equal(store.all("projects").length, 2);
});
test("routine daily limit rejects another run and upload cannot bypass approval", async () => {
  const store = await new Store().init(path.resolve(".test-limits-" + uid()));
  const pipeline = new Pipeline(store, {}, {});
  pipeline.suspended = true;
  store.put("routines", {
    id: "limited",
    maxRunsPerDay: 1,
    nodes: [],
    edges: [],
  });
  pipeline.enqueue(null, "routine", { routineId: "limited" });
  assert.throws(
    () => pipeline.enqueue(null, "routine", { routineId: "limited" }),
    /daily run limit/,
  );
  const p = await store.create({ title: "Internal approval check" });
  let called = false;
  pipeline.uploadVideo = async () => (called = true);
  store.put("routines", {
    id: "unsafe",
    projectId: p.id,
    nodes: [{ id: "upload", data: { action: "upload" } }],
    edges: [],
  });
  await assert.rejects(
    pipeline.routine({
      id: uid(),
      options: { routineId: "unsafe" },
      events: [],
      checkpoint: 0,
    }),
    /approved Approval/,
  );
  assert.equal(called, false);
});

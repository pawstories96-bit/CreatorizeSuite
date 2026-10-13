import { startServer } from "../server/index.mjs";
import { uid, atomic, run } from "../server/core.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const service = await startServer({
  root: path.resolve(".test-full-workflow-" + uid()),
  port: 0,
});
try {
  const actions = [
    ["topics", {}],
    ["create", { targetLengthSec: 12, style: "flat" }],
    ["script", {}],
    ["tts", { provider: "windows" }],
    ["build", { quality: "Verified" }],
    ["mix", {}],
    ["export", { resolution: "720p", fps: 12 }],
    ["thumbnail", { time: 2 }],
    ["metadata", {}],
    ["trailer", { duration: 3 }],
    ["approval", {}],
  ];
  const nodes = actions.map(([action, options], i) => ({
    id: String(i),
    data: { action, label: action, options },
  }));
  const routine = {
    id: uid(),
    name: "Internal complete workflow verification",
    topic:
      "A simple scientifically accurate explanation of why tree leaves appear green, suitable for a twelve second narrated short.",
    agent: { provider: "codex", effort: "low" },
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ source: String(i), target: n.id })),
  };
  service.store.put("routines", routine);
  const job = service.pipeline.enqueue(null, "routine", {
    routineId: routine.id,
  });
  let done;
  for (let i = 0; i < 1800; i++) {
    const j = service.store.get("jobs", job.id);
    if (i % 20 === 0)
      console.log(j.status, "step", j.checkpoint, j.events.at(-1)?.text);
    if (j.status === "waiting") {
      done = j;
      break;
    }
    if (["error", "paused", "stopped"].includes(j.status)) throw Error(j.error);
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(done, "Routine did not reach approval");
  const p = service.store.project(done.projectId);
  assert.ok(p.lastExport && p.trailer && p.thumbnail && p.metadata);
  assert.equal(p.visionQA, "passed");
  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    path.join(service.store.projectDir(p.id), p.trailer),
  ]);
  assert.deepEqual(JSON.parse(probe.stdout).streams[0], {
    width: 1080,
    height: 1920,
  });
  console.log(
    "PASS: live topic research → script → voice → verified AI scenes → mix → MP4 → thumbnail → metadata → vertical trailer → approval",
  );
  const childCount = Object.keys(done.childJobs).length;
  done.options.approved = true;
  service.store.put("jobs", done);
  service.pipeline.resume(done.id);
  for (let i = 0; i < 30; i++) {
    const j = service.store.get("jobs", job.id);
    if (j.status === "done") {
      assert.equal(Object.keys(j.childJobs).length, childCount);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(service.store.get("jobs", job.id).status, "done");
  atomic("test-results/full-workflow-results.json", {
    passed: true,
    workspace: service.store.root,
    projectId: p.id,
    export: p.lastExport,
    trailer: p.trailer,
    shots: p.shots.length,
    checkedAt: new Date().toISOString(),
  });
} finally {
  await service.close();
}

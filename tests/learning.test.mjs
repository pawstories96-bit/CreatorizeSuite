import test from "node:test";
import assert from "node:assert/strict";
import { saveLearning, queueAudienceLearning } from "../server/learning.mjs";
test("automatic learning is opt-in, requires corroboration and queues with a cooldown", () => {
  const records = { memory: [], learnings: [], uploads: [{ id: "u", projectId: "p", videoId: "abcdefghijk", status: "done", createdAt: "2026-10-12T00:00:00Z" }], projects: [{ id: "p" }], jobs: [] };
  const settings = { autoLearn: false, learningScope: "project" };
  const store = { settings: () => settings, all: k => records[k] || [], get: (k, id) => records[k]?.find(r => r.id === id), put: (k, record) => { const i = records[k].findIndex(r => r.id === record.id); if (i >= 0) records[k][i] = record; else records[k].push(record); } };
  const suggestions = [{ rule: "Keep the opening concise", evidence: ["c1", "r1"] }, { rule: "Use warmer colors", evidence: ["c2"] }, { rule: "Unverified", evidence: ["made-up-1", "made-up-2"] }], evidence = { videoId: "abcdefghijk", comments: [{ id: "c1" }, { id: "c2" }], retention: [{ id: "r1" }] }, job = { projectId: "p", options: { autoApply: true } };
  saveLearning(store, job, evidence, suggestions); assert.equal(records.memory.length, 0);
  settings.autoLearn = true; const report = saveLearning(store, job, evidence, suggestions); assert.equal(records.memory.length, 1); assert.deepEqual(report.approved, [0]); assert.equal(records.memory[0].projectId, "p");
  const calls = [], pipeline = { enqueue: (...args) => calls.push(args) }, vault = { has: () => true }, now = Date.parse("2026-10-15T00:00:00Z");
  queueAudienceLearning(store, pipeline, vault, now); queueAudienceLearning(store, pipeline, vault, now); assert.equal(calls.length, 1);
  queueAudienceLearning(store, pipeline, vault, now + 49 * 3600000); assert.equal(calls.length, 2);
});

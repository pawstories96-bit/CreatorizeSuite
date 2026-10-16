import test from "node:test";
import assert from "node:assert/strict";
import { scheduleSlot, validateSchedule, runSchedules } from "../server/schedules.mjs";
import { fullChannelRoutine } from "../public/lib/routines.js";
import { topo } from "../server/core.mjs";
test("daily and five-field cron schedules honor time zones and claim each due minute once", () => {
  const daily = { enabled: true, time: "09:00", timeZone: "Asia/Kolkata" };
  const now = new Date("2026-10-15T03:30:23Z"); assert.equal(scheduleSlot(daily, now), "2026-10-15T03:30:00.000Z");
  assert.equal(scheduleSlot(daily, new Date("2026-10-15T03:31:00Z")), null);
  const cron = { enabled: true, mode: "cron", cron: "*/15 9-17 * * 1-5", timeZone: "Asia/Kolkata" };
  assert.ok(scheduleSlot(cron, now)); assert.equal(scheduleSlot(cron, new Date("2026-10-17T03:30:00Z")), null);
  assert.throws(() => validateSchedule({ mode: "cron", cron: "* * * * * *" }), /five cron/);
  assert.throws(() => validateSchedule({ timeZone: "bad-zone" }));
  const routines = [{ id: "r", schedule: daily }], jobs = [], calls = [];
  const store = { all: k => k === "routines" ? routines : jobs, put: (_, r) => { routines[0] = r; } }, pipeline = { enqueue: (...args) => calls.push(args) };
  runSchedules(store, pipeline, now); runSchedules(store, pipeline, now); assert.equal(calls.length, 1);
  routines[0].lastScheduledSlot = null; jobs.push({ action: "routine", options: { routineId: "r" }, status: "waiting" }); runSchedules(store, pipeline, now); assert.equal(calls.length, 1); assert.match(routines[0].lastError, /previous run/);
});
test("full channel template is a connected 14-node graph with review before final publication", () => {
  const graph = fullChannelRoutine(), nodes = topo(graph.nodes, graph.edges);
  assert.equal(nodes.length, 14); assert.equal(graph.edges.length, 13);
  assert.equal(nodes.at(-2).data.action, "approval"); assert.equal(nodes.at(-1).data.action, "finish"); assert.equal(nodes.at(-1).data.options.upload, false);
});

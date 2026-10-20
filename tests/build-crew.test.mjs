import test from "node:test";
import assert from "node:assert/strict";
import { runBuildCrew } from "../server/build-crew.mjs";
function harness() {
  const records = new Map(),
    pipeline = {
      store: { get: (_, id) => records.get(id) },
      persist: (j) =>
        records.set(
          j.id,
          structuredClone(
            Object.fromEntries(
              Object.entries(j).filter(([k]) => k !== "abort"),
            ),
          ),
        ),
      emit(j, type, text) {
        j.events.push({ type, text });
        this.persist(j);
      },
    };
  return {
    pipeline,
    records,
    parent: { id: "director", projectId: "p", options: {}, events: [] },
  };
}
test("build crew overlaps independent shots, waits for shared sets, and isolates sessions/usage", async () => {
  const { pipeline, records, parent } = harness(),
    targets = [
      { id: "a", set: "harbor" },
      { id: "b", set: "harbor" },
      { id: "c", set: "interior" },
      { id: "d", set: "harbor" },
    ];
  let active = 0,
    peak = 0;
  const done = new Set();
  await runBuildCrew(
    pipeline,
    parent,
    targets,
    async (s, j) => {
      if (s.id === "b" || s.id === "d") assert.ok(done.has("a"));
      assert.equal(j.options.shotId, s.id);
      assert.equal(j.options.scope, "shot");
      active++;
      peak = Math.max(peak, active);
      j.usage = { input_tokens: 10, output_tokens: 3 };
      await new Promise((r) => setTimeout(r, s.id === "a" ? 15 : 30));
      done.add(s.id);
      active--;
    },
    { workers: 3, setFor: (s) => s.set },
  );
  assert.ok(peak >= 2 && peak <= 3);
  assert.equal(parent.crew.status, "done");
  assert.equal(new Set(Object.values(parent.crewJobs)).size, 4);
  assert.equal(records.size, 5);
  assert.equal(parent.crewUsage.input_tokens, 40);
  assert.equal(parent.runs, undefined);
  assert.ok(parent.crew.shots.every((s) => s.status === "done"));
});
test("crew failure aborts peers and waits for settlement before returning", async () => {
  const { pipeline, parent } = harness();
  let settled = false,
    started = 0;
  await assert.rejects(
    runBuildCrew(
      pipeline,
      parent,
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      async (s, j) => {
        started++;
        if (s.id === "a") {
          await new Promise((r) => setTimeout(r, 10));
          j.limitHit = true;
          throw Error("quota");
        }
        await new Promise((resolve) => {
          j.abort = () => {
            settled = true;
            resolve();
          };
        });
      },
      { workers: 2 },
    ),
    /quota/,
  );
  assert.equal(started, 2);
  assert.ok(settled);
  assert.equal(parent.limitHit, true);
  assert.equal(parent.crew.shots[2].status, "pending");
  assert.equal(parent.crew.status, "error");
});

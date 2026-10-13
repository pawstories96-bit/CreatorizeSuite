import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  Store,
  uid,
  validateWords,
  storyboardFromWords,
  validateScene,
  topo,
  safePath,
  allowedLicense,
  atomic,
  read,
  run,
} from "../server/core.mjs";
import { extractJSON } from "../server/agents.mjs";
test("timestamps reject backwards, missing, zero-length and out-of-range data", () => {
  assert.throws(() => validateWords([]));
  assert.throws(() => validateWords([{ w: "one", start: 1, end: 1 }]));
  assert.throws(() =>
    validateWords([
      { w: "one", start: 2, end: 3 },
      { w: "two", start: 1, end: 2 },
    ]),
  );
  assert.throws(() => validateWords([{ w: "one", start: 0, end: 10 }], 2));
  assert.equal(validateWords([{ w: "hello", start: 0, end: 1 }]).length, 1);
});
test("storyboard covers ordered narration without losing words", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({
    w: `word${i}${i % 10 === 9 ? "." : ""}`,
    start: i * 0.5,
    end: i * 0.5 + 0.45,
  }));
  const shots = storyboardFromWords(words);
  assert.equal(
    shots.map((s) => s.narration).join(" "),
    words.map((w) => w.w).join(" "),
  );
  assert.equal(shots[0].start, 0);
  for (let i = 1; i < shots.length; i++)
    assert.equal(shots[i - 1].end, shots[i].start);
  assert.equal(shots.at(-1).end, words.at(-1).end);
});
test("DAG validates ordering and blocks cycles and missing dependencies", () => {
  const n = [{ id: "b" }, { id: "a" }, { id: "c" }];
  assert.deepEqual(
    topo(n, [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ]).map((n) => n.id),
    ["a", "b", "c"],
  );
  assert.throws(() =>
    topo(n, [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ]),
  );
  assert.throws(() => topo(n, [{ source: "z", target: "a" }]));
});
test("asset license and scene file restrictions", () => {
  assert.equal(allowedLicense("CC-BY-SA-4.0"), true);
  assert.equal(allowedLicense("CC-BY-NC"), false);
  assert.equal(allowedLicense("unknown"), false);
  assert.throws(() => safePath("D:/test/project", "../../private"));
  assert.throws(() =>
    validateScene({
      elements: [
        { id: "x", type: "image", src: "https://tracking.invalid/x.png" },
      ],
    }),
  );
  assert.equal(
    validateScene({
      elements: [{ id: "subject", type: "circle", x: 200, y: 200 }],
    }).elements[0].opacity,
    1,
  );
});
test("provider JSON parsing handles code fences and rejects invalid output", () => {
  assert.deepEqual(extractJSON('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => extractJSON("Not JSON"));
});
test("SQLite persists records and each project has reversible git history", async () => {
  const root = path.resolve(".test-unit-" + uid());
  const store = await new Store().init(root);
  const p = await store.create({
    title: "Isolated test",
    script: "Initial narration",
  });
  const initial = (
    await run("git", ["rev-parse", "HEAD"], { cwd: store.projectDir(p.id) })
  ).stdout.trim();
  p.script = "Changed narration";
  atomic(path.join(store.projectDir(p.id), "script.txt"), p.script);
  store.saveProject(p);
  const changed = await store.commit(p.id, "Change narration");
  assert.notEqual(initial, changed);
  await run("git", ["revert", "--no-edit", changed], {
    cwd: store.projectDir(p.id),
  });
  assert.equal(
    read(path.join(store.projectDir(p.id), "project.json")).script,
    "Initial narration",
  );
  const reopened = await new Store().init(root);
  assert.equal(reopened.all("projects").length, 1);
  assert.equal(
    fs.readFileSync(path.join(root, "app.db")).subarray(0, 15).toString(),
    "SQLite format 3",
  );
});

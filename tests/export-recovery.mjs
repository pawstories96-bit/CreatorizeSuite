import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { startServer } from "../server/index.mjs";
import { uid, validateScene, run } from "../server/core.mjs";
const s = await startServer({
  root: path.resolve(".test-export-recovery-" + uid()),
  port: 0,
});
try {
  const p = await s.store.create({
      title: "Internal export recovery check",
      style: "flat",
    }),
    good = validateScene({
      background: "#21323f",
      elements: [
        {
          id: "disc",
          type: "circle",
          x: 640,
          y: 360,
          radius: 90,
          fill: "#dfa45e",
        },
      ],
    }),
    broken = validateScene({
      elements: [
        {
          id: "missing",
          type: "image",
          src: "assets/no-such-image.png",
          x: 640,
          y: 360,
          width: 200,
          height: 200,
        },
      ],
    });
  p.durationSec = 0.2;
  p.shots = [
    { id: "s001", start: 0, end: 0.1, narration: "A circle", scene: good },
    {
      id: "s002",
      start: 0.1,
      end: 0.2,
      narration: "Another circle",
      scene: broken,
    },
  ];
  s.store.saveProject(p);
  let repairs = 0,
    reviews = 0;
  s.pipeline.agents.generate = async ({ role, prompt, images }) => {
    if (role === "qa") {
      reviews++;
      assert.ok(images.length >= 3);
      return { pass: true, issues: [] };
    }
    repairs++;
    assert.match(prompt, /Repair ONLY this shot/);
    assert.match(prompt, /s002/);
    return good;
  };
  const wait = async (j) => {
    for (let i = 0; i < 600; i++) {
      const current = s.store.get("jobs", j.id);
      if (["done", "error"].includes(current.status)) return current;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Export recovery timed out");
  };
  const j = await wait(
    s.pipeline.enqueue(p.id, "export", { resolution: "test", fps: 10 }),
  );
  assert.equal(j.status, "done", j.error);
  assert.equal(repairs, 1);
  assert.equal(reviews, 1);
  assert.equal(j.renderRepairs[0].shotId, "s002");
  assert.deepEqual(s.store.project(p.id).shots[0].scene, good);
  assert.ok(
    fs.statSync(path.join(s.store.projectDir(p.id), j.output)).size > 500,
  );
  const info = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        path.join(s.store.projectDir(p.id), j.output),
      ])
    ).stdout,
  );
  assert.equal(info.streams[0].nb_frames, "2");
  const p2 = s.store.project(p.id);
  p2.shots[1].scene = broken;
  s.store.saveProject(p2);
  const off = await wait(
    s.pipeline.enqueue(p.id, "export", {
      resolution: "test",
      fps: 10,
      autoHeal: false,
    }),
  );
  assert.equal(off.status, "error");
  assert.equal(repairs, 1);
  const renderer = s.pipeline.export;
  s.pipeline.export = async () => {
    throw Error("Encoder unavailable");
  };
  const plain = await wait(s.pipeline.enqueue(p.id, "export", {}));
  assert.equal(plain.status, "error");
  assert.equal(repairs, 1);
  s.pipeline.export = renderer;
  s.pipeline.agents.generate = async ({ role }) =>
    role === "qa" ? { pass: false, issues: ["Subject absent"] } : good;
  const rejected = await wait(
    s.pipeline.enqueue(p.id, "export", { resolution: "test", fps: 10 }),
  );
  assert.equal(rejected.status, "error");
  assert.deepEqual(s.store.project(p.id).shots[1].scene, broken);
  console.log(
    "PASS: actual missing-asset detection, scoped repair with independent image review, MP4 restart/two decoded frames, opt-out, encoder errors bypass AI and rejected repair rollback",
  );
} finally {
  await s.close();
}

import { startServer } from "../server/index.mjs";
import { uid, atomic } from "../server/core.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(".test-provider-" + uid());
const service = await startServer({ root, port: 0 });
const wait = async (job) => {
  let count = 0;
  while (count++ < 1800) {
    const j = service.store.get("jobs", job.id);
    if (count % 20 === 0)
      console.log(j.status, j.progress, j.events.at(-1)?.text);
    if (["done", "error", "stopped", "paused"].includes(j.status)) {
      if (j.status !== "done") throw Error(j.error);
      return j;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Timeout");
};
try {
  const p = await service.store.create({
    title: "QA only: a seed grows",
    script:
      "A tiny seed opens. Its roots reach down, while a green shoot grows toward the sun.",
    style: "flat",
    targetLengthSec: 8,
  });
  await wait(service.pipeline.enqueue(p.id, "tts", { provider: "windows" }));
  const build = await wait(
    service.pipeline.enqueue(p.id, "build", {
      quality: "Standard",
      direction:
        "Create a detailed botanical cutaway of a seed growing, roots below ground and a green shoot above. No narration text on screen.",
    }),
  );
  const result = service.store.project(p.id);
  assert.ok(result.shots.every((s) => s.scene && s.qa && !s.qa.issues.length));
  console.log(
    "PASS: live Codex generated actual validated scene geometry",
    result.shots.length,
  );
  const edit = await wait(
    service.pipeline.enqueue(p.id, "edit", {
      scope: "shot",
      shotId: result.shots[0].id,
      prompt:
        "Add a large warm golden sun in the top right corner without covering the plant.",
    }),
  );
  assert.ok(edit.commit);
  console.log("PASS: real scoped AI edit and Git commit");
  const render = await wait(
    service.pipeline.enqueue(p.id, "export", { resolution: "720p", fps: 12 }),
  );
  assert.ok(render.size > 1000);
  console.log("PASS: real AI-generated video exported", render.output);
  atomic("test-results/provider-results.json", {
    passed: true,
    root,
    projectId: p.id,
    shots: result.shots.length,
    export: render.output,
    editCommit: edit.commit,
    buildCommit: build.commit,
  });
} finally {
  await service.close();
}

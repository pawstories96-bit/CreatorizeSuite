import { startServer } from "../server/index.mjs";
import { uid, atomic, run } from "../server/core.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const service = await startServer({
  root: path.resolve(".test-calibration-" + uid()),
  port: 0,
});
const wait = async (job) => {
  for (let i = 0; i < 500; i++) {
    const j = service.store.get("jobs", job.id);
    if (i % 20 === 0) console.log(j.action, j.status, j.events.at(-1)?.text);
    if (j.status === "done") return j;
    if (["error", "paused", "stopped"].includes(j.status)) throw Error(j.error);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Timeout");
};
try {
  service.store.put("settings", {
    id: "app",
    provider: "codex",
    effort: "low",
  });
  await wait(service.pipeline.enqueue(null, "calibrate"));
  assert.ok(service.store.all("calibrations")[0].vision);
  console.log(
    "PASS: live Codex scene generation and independent image recognition calibration",
  );
  const p = await service.store.create({
    title: "Internal audio mix check",
    script:
      "This narration should remain audible while music plays underneath it.",
  });
  await wait(service.pipeline.enqueue(p.id, "tts", { provider: "windows" }));
  const file = path.join(service.store.projectDir(p.id), "assets", "bed.wav");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=2",
    file,
  ]);
  await wait(
    service.pipeline.enqueue(p.id, "mix", {
      ambiencePath: "assets/bed.wav",
      level: -20,
    }),
  );
  const result = service.store.project(p.id);
  assert.ok(result.mix);
  assert.equal(result.mixReport.ambience, "assets/bed.wav");
  assert.ok(
    (await service.pipeline.duration(
      path.join(service.store.projectDir(p.id), result.mix),
    )) > 2,
  );
  console.log("PASS: real imported audio looping, ducking and narration mix");
  atomic("test-results/calibration-results.json", {
    passed: true,
    calibrations: service.store.all("calibrations"),
    checkedAt: new Date().toISOString(),
  });
} finally {
  await service.close();
}

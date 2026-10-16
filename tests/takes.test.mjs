import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { Store, uid, run, validateScene } from "../server/core.mjs";
import { saveRetakeAnalysis, applyRetakes, validateRetakes } from "../server/takes.mjs";
test("retake suggestions require a real repeated opening and never remove the retained take", () => {
  const words = "The bridge was built sorry again The bridge was built in nineteen seventy seven".split(" ").map((w, i) => ({ w, start: i * .5, end: i * .5 + .4 }));
  const good = { removeStart: 0, removeEnd: 5, keepStart: 6, keepEnd: 13, reason: "The earlier attempt was abandoned" };
  assert.equal(validateRetakes([good], words).length, 1);
  assert.equal(validateRetakes([{ ...good, keepStart: 8 }], words).length, 0);
  assert.equal(validateRetakes([good, { removeStart: 6, removeEnd: 8, keepStart: 10, keepEnd: 13, reason: "invalid" }], words).length, 1);
});
test("real retake cuts preserve the later words, original media and composed camera synchronization", async () => {
  const store = await new Store().init(path.resolve(".test-retakes-" + uid())), p = await store.create({ title: "Internal take selection check" }), dir = store.projectDir(p.id);
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=7.1:sample_rate=48000", path.join(dir, "audio", "source.wav")]);
  p.script = "The bridge was built sorry again The bridge was built in nineteen seventy seven";
  p.words = p.script.split(" ").map((w, i) => ({ w, start: i * .5 + .05, end: i * .5 + .4 })); p.audio = "audio/source.wav"; p.sourceVideo = "assets/camera.mp4"; p.durationSec = 7.1;
  p.shots = [{ id: "s001", start: 0, end: 3, scene: validateScene({ elements: [{ id: "shape", type: "circle", radius: 30 }] }) }, { id: "s002", start: 3, end: 7.1, scene: validateScene({ elements: [{ id: "other", type: "circle", radius: 30 }] }) }]; store.saveProject(p);
  const analysis = saveRetakeAnalysis(store, p, [{ removeStart: 0, removeEnd: 5, keepStart: 6, keepEnd: 13, reason: "Repeated start" }]);
  const { removedWords } = await applyRetakes(store, p, { id: uid(), options: { analysisId: analysis.id, selected: [analysis.takes[0].id] } });
  assert.equal(removedWords, 6); assert.equal(p.script, "The bridge was built in nineteen seventy seven"); assert.equal(p.words.length, 8); assert.equal(p.sourceTranscript.split(" ").length, 14);
  const first = p.words[0], cut = p.cameraCuts.findLast(c => first.start >= c.outputStart && first.start < c.outputEnd); assert.ok(Math.abs(cut.sourceStart + first.start - cut.outputStart - 3.05) < .001);
  const actual = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path.join(dir, p.audio)])).stdout); assert.ok(Math.abs(actual - p.durationSec) < .002);
  assert.ok(fs.existsSync(path.join(dir, "audio", "source.wav"))); assert.ok(p.shots.every(s => s.end > s.start));
  await assert.rejects(applyRetakes(store, p, { options: { analysisId: analysis.id, selected: [analysis.takes[0].id] } }), /changed/);
});

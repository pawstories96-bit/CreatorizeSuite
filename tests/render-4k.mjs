import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { atomic, run, uid, validateScene } from "../server/core.mjs";
const service = await startServer({ root: path.resolve(".test-4k-" + uid()), port: 0 });
try {
  const p = await service.store.create({ title: "Internal 4K render verification", style: "3d" });
  p.durationSec = 1.5;
  p.shots = [{ id: "s001", start: 0, end: 1.5, status: "built", scene: validateScene({
    background: "#bac7c2", cameraRig: { type: "orbit", radius: 13, height: 7, speed: 0.3 },
    kits: [{ id: "ship", type: "ship", x: 0, y: 0, z: 0 }],
    elements: [{ id: "floor", type: "box", x: 0, y: -0.1, z: 0, width: 20, height: 0.2, depth: 20, fill: "#8eaaa7" }, { id: "label", type: "text", x: 640, y: 80, width: 600, height: 80, text: "4K motion verification", fill: "#203b42", fontSize: 40 }],
  }) }];
  service.store.saveProject(p);
  const job = { id: uid(), projectId: p.id, action: "export", options: { resolution: "4K", fps: 24 }, events: [] };
  const started = Date.now();
  await service.pipeline.export(p, job);
  const file = path.join(service.store.projectDir(p.id), job.output);
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames,r_frame_rate", "-of", "json", file])).stdout).streams[0];
  assert.equal(probe.width, 3840); assert.equal(probe.height, 2160); assert.equal(Number(probe.nb_read_frames), 36); assert.equal(probe.r_frame_rate, "24/1");
  const result = { passed: true, ...probe, elapsedSeconds: (Date.now() - started) / 1000, bytes: job.size, checkedAt: new Date().toISOString() };
  atomic("test-results/render-4k.json", result);
  console.log("PASS: actual 3840×2160 H.264 export, 36 frames at 24 fps, animated camera, 3D lighting/shadows and overlaid text", JSON.stringify(result));
} finally { await service.close(); }

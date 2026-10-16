import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { uid, run, atomic, validateScene } from "../server/core.mjs";
const service = await startServer({
  root: path.resolve(".test-duration-" + uid()),
  port: 0,
});
try {
  const p = await service.store.create({
      title: "Internal sustained export check",
      style: "3d",
    }),
    dir = service.store.projectDir(p.id);
  p.durationSec = 30;
  p.audio = "audio/source.wav";
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=30:sample_rate=48000",
    path.join(dir, p.audio),
  ]);
  p.shots = Array.from({ length: 3 }, (_, i) => ({
    id: "s00" + (i + 1),
    start: i * 10,
    end: (i + 1) * 10,
    title: "Sustained scene " + i,
    scene: validateScene({
      background: ["#d9e5dd", "#e5e0d9", "#dce1e9"][i],
      cameraRig: { type: "orbit", radius: 13, height: 7, speed: 0.15 },
      effects: { ssao: false, bloom: 0, grain: 0 },
      kits: [{ id: "figure", type: "character", x: 0, y: 0, z: 0 }],
      elements: [
        {
          id: "ground",
          type: "box",
          width: 20,
          height: 0.2,
          depth: 20,
          y: -0.1,
          fill: "#81998a",
        },
        {
          id: "moving",
          type: "box",
          width: 2,
          height: 2,
          depth: 2,
          y: 1,
          x: 4,
          fill: "#a75d47",
          animation: "rotate",
          duration: 10,
        },
        {
          id: "label",
          type: "text",
          x: 640,
          y: 70,
          width: 800,
          height: 70,
          text: "Sustained 1080p / 60 fps",
          fontSize: 38,
          fill: "#1d3428",
        },
      ],
    }),
  }));
  service.store.saveProject(p);
  const job = {
      id: uid(),
      projectId: p.id,
      action: "export",
      options: { resolution: "1080p", fps: 60 },
      events: [],
    },
    started = Date.now();
  await service.pipeline.export(p, job);
  const probe = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-count_frames",
          "-show_entries",
          "stream=codec_type,width,height,nb_read_frames,r_frame_rate,duration",
          "-of",
          "json",
          path.join(dir, job.output),
        ])
      ).stdout,
    ),
    video = probe.streams.find((s) => s.codec_type === "video"),
    audio = probe.streams.find((s) => s.codec_type === "audio");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, "60/1");
  assert.equal(Number(video.nb_read_frames), 1800);
  assert.ok(Math.abs(Number(audio.duration) - 30) < 0.05);
  const result = {
    passed: true,
    video,
    audio,
    elapsedSeconds: (Date.now() - started) / 1000,
    bytes: job.size,
    checkedAt: new Date().toISOString(),
  };
  atomic("test-results/render-duration.json", result);
  console.log(
    "PASS: sustained 30-second 1080p 60-fps export with 1,800 actual frames, three animated 3D shots and synchronized audio",
    JSON.stringify(result),
  );
} finally {
  await service.close();
}

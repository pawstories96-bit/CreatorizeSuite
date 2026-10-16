import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { uid, validateScene, run } from "../server/core.mjs";
import { fullChannelRoutine } from "../public/lib/routines.js";
const service = await startServer({ root: path.resolve(".test-autopilot-" + uid()), port: 0 });
const wait = async (id, statuses) => { for (let i = 0; i < 2400; i++) { const j = service.store.get("jobs", id); if (j.status === "error") throw Error(j.error); if (statuses.includes(j.status)) return j; await new Promise(r => setTimeout(r, 100)); } throw Error("Autopilot timed out"); };
try {
  service.pipeline.agents.generate = async ({ role, prompt }) => {
    if (role === "qa") return { pass: true, issues: [] };
    if (role === "metadata") return { titles: ["Where rain becomes a river"], description: "An original explanation of water flowing from hills to the sea.", tags: ["water", "science"] };
    if (role === "research" && /Research one original video topic/.test(prompt)) return { title: "Water on the hills", topic: "How rainwater gathers into a river", angle: "Follow one drop", sources: [] };
    if (role === "research" && /Research the topic/.test(prompt)) return { framing: "Follow a drop", research: "Internal protocol fixture: water flows downhill.", unverified: [] };
    if (["script", "research"].includes(role)) return { script: "Rain falls on the hills. Water gathers into a river and flows toward the sea.", reviewNotes: [] };
    return validateScene({ background: "#cedfd9", elements: [{ id: "hill", type: "circle", x: 480, y: 650, radius: 350, fill: "#5d9674" }, { id: "river", type: "path", x: 0, y: 0, path: "M600 320 Q800 450 650 720 L800 720 Q950 450 640 320Z", fill: "#398da1" }] });
  };
  const graph = fullChannelRoutine(); graph.nodes.find(n => n.data.action === "export").data.options = { resolution: "720p", fps: 12 };
  const routine = { id: uid(), name: "Internal complete graph check", topic: "Rainwater", nodes: graph.nodes, edges: graph.edges, workspaceId: "personal" }; service.store.put("routines", routine);
  const job = service.pipeline.enqueue(null, "routine", { routineId: routine.id });
  const waiting = await wait(job.id, ["waiting"]); assert.equal(waiting.checkpoint, 12);
  const p = service.store.project(waiting.projectId); assert.ok(p.lastExport); assert.ok(fs.statSync(path.join(service.store.projectDir(p.id), p.lastExport)).size > 1000); assert.ok(p.thumbnail); assert.equal(p.metadata.titles[0], "Where rain becomes a river");
  const approval = await fetch(`${service.url}/api/jobs/${job.id}/approve`, { method: "POST", headers: { Origin: service.url } }); assert.equal(approval.status, 200);
  const done = await wait(job.id, ["done"]), completed = service.store.project(p.id);
  assert.ok(completed.trailer); assert.equal(completed.kanbanStage, "ready"); assert.equal(done.checkpoint, 14);
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", path.join(service.store.projectDir(p.id), completed.trailer)])).stdout);
  const video = probe.streams.find(s => s.codec_type === "video"); assert.equal(video.width, 1080); assert.equal(video.height, 1920); assert.ok(probe.streams.some(s => s.codec_type === "audio"));
  const finalJob = service.store.get("jobs", done.childJobs[graph.nodes.at(-1).id]); assert.ok(finalJob.notification); assert.ok(finalJob.finalSteps.includes("reframe"));
  console.log("PASS: all 14 routine nodes, actual Windows voice/word timing, scene rendering, sound mix, MP4 and thumbnail, metadata, durable review pause, real vertical reframe, stage move and notification payload");
} finally { await service.close(); }

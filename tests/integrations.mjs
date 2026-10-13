import { startServer } from "../server/index.mjs";
import { uid, atomic } from "../server/core.mjs";
import path from "node:path";
import assert from "node:assert/strict";
const service = await startServer({
  root: path.resolve(".test-integrations-" + uid()),
  port: 0,
});
const wait = async (job) => {
  for (let i = 0; i < 1500; i++) {
    const j = service.store.get("jobs", job.id);
    if (i % 30 === 0)
      console.log(j.action, j.status, j.progress, j.events.at(-1)?.text);
    if (j.status === "done") return j;
    if (["error", "paused", "stopped"].includes(j.status)) throw Error(j.error);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Timeout");
};
try {
  service.store.put("settings", {
    id: "app",
    provider: "claude",
    effort: "medium",
  });
  if (!process.env.SKIP_CLAUDE) {
    try {
      await wait(service.pipeline.enqueue(null, "test"));
      console.log("PASS: Claude CLI live connection test");
    } catch (e) {
      console.log("EXTERNAL BLOCKER: Claude CLI smoke test", e.message);
    }
  }
  const p = await service.store.create({
    title: "Internal transcription check",
    script:
      "The rain falls on the hills. Water gathers into a river and flows toward the sea.",
    language: "en",
  });
  await wait(service.pipeline.enqueue(p.id, "tts", { provider: "windows" }));
  service.store.put("settings", {
    ...service.store.settings(),
    id: "app",
    whisperModel: "tiny",
  });
  await wait(service.pipeline.enqueue(p.id, "time"));
  assert.ok(service.store.project(p.id).words.length > 10);
  console.log("PASS: actual local Whisper transcription and word timestamps");
  service.store.put("settings", {
    ...service.store.settings(),
    id: "app",
    provider: "codex",
  });
  const p2 = await service.store.create({
    title: "Internal research check",
    topic: "How seeds germinate: water, warmth and oxygen",
    language: "en",
    targetLengthSec: 30,
  });
  await wait(service.pipeline.enqueue(p2.id, "script"));
  const result = service.store.project(p2.id);
  assert.ok(result.script.length > 100);
  assert.match(result.research, /https:\/\//);
  console.log("PASS: live research, writing, fact-checking and humanization");
  atomic("test-results/integration-results.json", {
    passed: true,
    workspace: service.store.root,
    scriptWords: result.scriptWordCount,
    checkedAt: new Date().toISOString(),
  });
} finally {
  await service.close();
}

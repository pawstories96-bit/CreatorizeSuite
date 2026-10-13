import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../server/index.mjs";
import { uid } from "../server/core.mjs";
test("audience suggestions require real evidence IDs and never change memory until approval", async () => {
  const service = await startServer({
    root: path.resolve(".test-audience-" + uid()),
    port: 0,
  });
  try {
    service.pipeline.youtubeInsights = async () => ({
      videoId: "abcdefghijk",
      comments: [{ id: "comment-1", text: "The opening took too long." }],
      retention: [],
      warnings: [],
    });
    service.pipeline.agents.generate = async () => ({
      suggestions: [
        {
          rule: "Make the opening concise.",
          reason: "Audience feedback",
          evidence: ["comment-1"],
        },
        {
          rule: "Invented recommendation",
          reason: "Not evidence",
          evidence: ["made-up"],
        },
      ],
    });
    const job = service.pipeline.enqueue(null, "learn", {
      videoId: "abcdefghijk",
    });
    for (let i = 0; i < 200; i++) {
      if (service.store.get("jobs", job.id).status === "done") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(service.store.get("jobs", job.id).status, "done");
    const report = service.store.all("learnings")[0];
    assert.equal(report.suggestions.length, 1);
    assert.equal(service.store.all("memory").length, 0);
    for (let i = 0; i < 2; i++) {
      const r = await fetch(
        service.url + "/api/learnings/" + report.id + "/approve",
        {
          method: "POST",
          headers: { Origin: service.url, "Content-Type": "application/json" },
          body: JSON.stringify({ index: 0 }),
        },
      );
      assert.equal(r.status, 200);
    }
    assert.equal(service.store.all("memory").length, 1);
    assert.deepEqual(service.store.all("memory")[0].evidence, ["comment-1"]);
  } finally {
    await service.close();
  }
});

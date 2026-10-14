import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import http from "node:http";
import { startServer } from "../server/index.mjs";
import { uid, atomic, validateScene } from "../server/core.mjs";
const service = await startServer({
  root: path.resolve(".test-agent-tools-" + uid()),
  port: 0,
});
let child;
try {
  const p = await service.store.create({ title: "Internal MCP verification" });
  p.words = [{ w: "Circle", start: 0, end: 2 }];
  const scene = validateScene({
    background: "#111111",
    elements: [
      {
        id: "circle",
        type: "circle",
        x: 640,
        y: 360,
        radius: 150,
        fill: "#ffcc00",
      },
    ],
  });
  p.shots = [
    { id: "s001", start: 0, end: 2, narration: "Circle", scene: null },
  ];
  p.durationSec = 2;
  service.store.saveProject(p);
  const events = [];
  const job = { id: uid(), projectId: p.id, options: {} };
  const bridge = service.agentTools.register(job, (level, message) =>
    events.push(message),
  );
  child = spawn(process.execPath, bridge.config.args, {
    env: { ...process.env, ...bridge.config.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let nextId = 0;
  const pending = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const result = JSON.parse(line);
    pending.get(result.id)?.(result);
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("MCP request timed out"));
      }, 100_000);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(response);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  assert.equal(
    (await request("initialize", { protocolVersion: "2025-03-26" })).result
      .serverInfo.name,
    "framecraft",
  );
  assert.ok(
    (await request("tools/list")).result.tools.some(
      (t) => t.name === "set_ambience",
    ),
  );
  const call = async (name, args = {}) =>
    (await request("tools/call", { name, arguments: args })).result;
  const current = await call("get_project");
  assert.equal(JSON.parse(current.content[0].text).id, p.id);
  const renamed = await call("update_storyboard", { shots: [{ id: "s001", title: "Staged title" }] });
  assert.equal(renamed.isError, undefined);
  assert.equal(job.toolDrafts.titles[0].title, "Staged title");
  assert.notEqual(service.store.project(p.id).shots[0].title, "Staged title");
  job.options.scope = "selection";
  const blocked = await call("set_ambience", { clips: [] });
  assert.equal(blocked.isError, true);
  job.options.scope = "whole";
  const staged = await call("set_ambience", { clips: [] });
  assert.equal(staged.isError, undefined);
  assert.ok(job.toolDrafts.timeline);
  const proposed = await call("save_memory_rule", { text: "Keep short labels readable" });
  const proposalId = JSON.parse(proposed.content[0].text).id;
  assert.equal(service.store.all("memory").length, 0);
  assert.ok(service.store.get("memoryProposals", proposalId));
  const approved = await fetch(`${service.url}/api/memory-proposals/${proposalId}/approve`, { method: "POST", headers: { Origin: service.url } });
  assert.equal(approved.status, 200);
  assert.ok(service.store.get("memory", proposalId));
  delete job.toolDrafts;
  console.log("PASS: tool changes stay staged, scoped edits cannot change global tracks, memory requires approval");
  const frames = await call("render_frames", {
    shotId: "s001",
    scene,
    times: [0.5, 1.5],
  });
  assert.equal(frames.content.filter((c) => c.type === "image").length, 2);
  assert.equal(
    Buffer.from(frames.content[1].data, "base64").subarray(1, 4).toString(),
    "PNG",
  );
  const checked = await call("check_preview", { shotId: "s001", scene });
  assert.deepEqual(JSON.parse(checked.content[0].text).issues, []);
  assert.equal(
    JSON.parse(
      (await call("get_words", { start: 0.5, end: 1 })).content[0].text,
    ).length,
    1,
  );
  const layoutScene = validateScene({
    elements: [
      {
        id: "a",
        type: "text",
        text: "Overlapping",
        x: 20,
        y: 100,
        width: 300,
        height: 70,
        fontSize: 50,
        rotation: 30,
      },
      {
        id: "b",
        type: "text",
        text: "Labels",
        x: 40,
        y: 100,
        width: 300,
        height: 70,
        fontSize: 50,
      },
    ],
  });
  const layout = await call("measure_layout", {
    shotId: "s001",
    scene: layoutScene,
    time: 0.5,
  });
  assert.ok(
    JSON.parse(layout.content[0].text).metrics.some(
      (m) => m.offscreen && m.overflow,
    ),
  );
  assert.deepEqual(JSON.parse(layout.content[1].text).textOverlapCandidates, [
    ["a", "b"],
  ]);
  assert.equal(
    service.store.project(p.id).shots[0].scene,
    null,
    "Draft previews must not save scene changes",
  );
  assert.equal(
    (await call("render_frames", { shotId: "outside-project", scene })).isError,
    true,
  );
  assert.equal(
    (await call("render_frames", { shotId: "s001", scene, times: [99] }))
      .isError,
    true,
  );
  bridge.dispose();
  assert.equal((await call("get_project")).isError, true);
  child.stdin.end();
  console.log(
    "PASS: real stdio MCP handshake, PNG frames, layout checks, read-only previews, job isolation and session revocation",
  );
  // Protocol fixture only; app runtime never returns mocked provider responses.
  let rounds = 0;
  const fixture = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    res.setHeader("Content-Type", "application/json");
    rounds++;
    if (rounds === 1) {
      assert.ok(request.tools.some((t) => t.function.name === "fetch_url"));
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "preview1",
                    type: "function",
                    function: {
                      name: "render_frames",
                      arguments: JSON.stringify({
                        shotId: "s001",
                        scene,
                        times: [0.5],
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    } else {
      assert.ok(
        request.messages.some(
          (m) => m.role === "tool" && m.tool_call_id === "preview1",
        ),
      );
      assert.ok(
        request.messages
          .at(-1)
          .content.some(
            (c) =>
              c.type === "image_url" &&
              c.image_url.url.startsWith("data:image/png;base64,"),
          ),
      );
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 3 },
        }),
      );
    }
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  try {
    service.store.put("settings", {
      id: "app",
      localUrl: `http://127.0.0.1:${fixture.address().port}/v1`,
    });
    const apiJob = {
      id: uid(),
      projectId: p.id,
      options: { agent: { provider: "local", model: "protocol-fixture" } },
    };
    const result = await service.pipeline.agents.generate({
      cwd: service.store.projectDir(p.id),
      job: apiJob,
      emit: () => {},
      prompt: "Verify the tool protocol",
    });
    assert.equal(result.ok, true);
    assert.equal(rounds, 2);
    assert.equal(apiJob.usage.input_tokens, 30);
    assert.equal(apiJob.usage.output_tokens, 8);
    assert.equal(service.agentTools.sessions.size, 0);
    console.log(
      "PASS: compatible API tool loop delivers real rendered PNGs, follows tool IDs and aggregates usage",
    );
  } finally {
    await new Promise((resolve) => fixture.close(resolve));
  }
  if (process.env.LIVE_MCP === "1") {
    const generated = await service.pipeline.agents.generate({
      cwd: service.store.projectDir(p.id),
      job,
      role: "build",
      emit: (level, message) => {
        events.push(message);
        console.log(level, message);
      },
      prompt: `This is an integration verification. You MUST call Framecraft get_project, render_frames for shot s001 with this scene ${JSON.stringify(scene)} at time .5, and check_preview on that same candidate scene. Inspect the actual image, then return JSON {"color":"the circle color","previewChecked":true}. Do not use shell or read files.`,
    });
    assert.match(generated.color, /yellow|gold/i);
    assert.ok(generated.previewChecked);
    for (const name of ["get_project", "render_frames", "check_preview"])
      assert.ok(
        events.filter((event) => event === "Agent tool: " + name).length >= 2,
        "Live CLI must invoke " + name,
      );
    assert.equal(service.agentTools.sessions.size, 0);
    console.log(
      "PASS: signed-in Codex called all three MCP tools and understood the rendered image",
    );
  }
  atomic("test-results/agent-tools-results.json", {
    passed: true,
    live: process.env.LIVE_MCP === "1",
    checkedAt: new Date().toISOString(),
    events,
  });
} finally {
  child?.kill();
  await service.close();
}

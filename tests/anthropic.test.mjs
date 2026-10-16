import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { anthropicModels, anthropicGenerate } from "../server/anthropic.mjs";
import { AgentRunner } from "../server/agents.mjs";
import { ModelCatalog } from "../server/model-catalog.mjs";
import { uid, atomic } from "../server/core.mjs";

test("native Anthropic catalog, image tools, cache accounting, endpoint isolation and errors", async () => {
  const requests = [], root = path.resolve(".test-anthropic-" + uid());
  fs.mkdirSync(root, { recursive: true }); atomic(path.join(root, "AGENT_GUIDE.md"), "Stable rendering guide");
  const fixture = http.createServer(async (req, res) => {
    assert.equal(req.headers["x-api-key"], "fixture-key"); assert.equal(req.headers["anthropic-version"], "2023-06-01");
    let text = ""; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : null; requests.push({ url: req.url, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/models")) return res.end(JSON.stringify(req.url.includes("after_id") ? { data: [{ id: "retired", lifecycle: "retired" }], has_more: false } : { data: [{ id: "live-model", display_name: "Live model", max_tokens: 4096, capabilities: { image_input: { supported: true }, effort: { supported: true, high: { supported: true }, low: { supported: true } } } }], has_more: true, last_id: "live-model" }));
    const round = requests.filter(r => r.body).length;
    if (body.model === "rate-limited") { res.statusCode = 429; return res.end(JSON.stringify({ error: { message: "Account rate limit" } })); }
    res.end(JSON.stringify({ content: round === 1 ? [{ type: "tool_use", id: "preview-1", name: "render_frames", input: { shot: "s01" } }] : [{ type: "text", text: '{"ok":true}' }], stop_reason: round === 1 ? "tool_use" : "end_turn", usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } }));
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const settings = { provider: "anthropic", model: "live-model", effort: "high", anthropicUrl: `http://127.0.0.1:${fixture.address().port}`, modelPrices: { "anthropic:live-model": { input: 3, output: 15, cached: .3, cacheWrite: 3.75 } } };
  const vault = { get: async name => { assert.equal(name, "anthropicKey"); return "fixture-key"; } };
  const store = { root, settings: () => settings, all: () => [], get: () => null };
  const catalog = new ModelCatalog(store, vault, () => { throw Error("No CLI expected"); });
  try {
    const list = await catalog.list("anthropic"); assert.deepEqual(list.models.map(m => m.id), ["live-model"]); assert.deepEqual(list.models[0].efforts, ["low", "high"]);
    const before = requests.length;
    await assert.rejects(catalog.list("anthropic", { endpoint: "http://unconfigured.invalid" }), /Save the Anthropic endpoint/); assert.equal(requests.length, before);
    let disposed = 0, calls = 0;
    const agent = new AgentRunner(store, vault);
    agent.toolBridge = { register: () => ({ tools: [{ name: "render_frames", description: "Render", inputSchema: { type: "object", properties: {} } }], call: async (name, input) => { calls++; assert.equal(name, "render_frames"); assert.equal(input.shot, "s01"); return { content: [{ type: "text", text: "Rendered" }, { type: "image", mimeType: "image/png", data: "aW1hZ2U=" }] }; }, dispose: () => disposed++ }) };
    const job = { id: "fixture", usage: {} };
    assert.deepEqual(await agent.generate({ prompt: "Stable rendering guide\nMake one scene", cwd: root, job, emit: () => {} }), { ok: true });
    assert.equal(disposed, 1); assert.equal(calls, 1);
    const bodies = requests.filter(r => r.body).map(r => r.body);
    assert.deepEqual(bodies[0].output_config, { effort: "high" }); assert.equal(bodies[0].max_tokens, 4096);
    assert.equal(bodies[0].system[0].cache_control.type, "ephemeral"); assert.equal(bodies[0].tools[0].cache_control.type, "ephemeral");
    assert.equal(bodies[0].messages[0].content[0].text, "Make one scene");
    assert.equal(bodies[1].messages.at(-1).content[0].tool_use_id, "preview-1");
    assert.equal(bodies[1].messages.at(-1).content[0].content[1].source.media_type, "image/png");
    assert.deepEqual(job.runs[0].usage, { input_tokens: 340, output_tokens: 20, cached_input_tokens: 200, cache_write_tokens: 100 });
    assert.equal(job.runs[0].billing, "metered"); assert.ok(Math.abs(job.estimatedCost - .000855) < 1e-10);
    const limited = { usage: {} };
    await assert.rejects(anthropicGenerate({ settings, key: "fixture-key", model: "rate-limited", prompt: "test", cwd: root, job: limited, emit: () => {}, catalog: () => [] }), /429.*rate limit/); assert.equal(limited.limitHit, true);
    await assert.rejects(anthropicGenerate({ settings, key: null, model: "live-model", job: {}, bridge: { dispose: () => disposed++ } }), /API key/); assert.equal(disposed, 2);
  } finally { await new Promise(resolve => fixture.close(resolve)); }
});

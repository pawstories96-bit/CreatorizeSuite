import test from "node:test";
import assert from "node:assert/strict";
import { AgentRunner } from "../server/agents.mjs";
import { normalizeUsage, estimateUsage, priceUnpricedRuns } from "../server/usage.mjs";

test("budget retry prices missing estimates without changing previously recorded prices", () => {
  const job = { runs: [
    { provider: "api", model: "m", usage: { input_tokens: 1000, output_tokens: 200 } },
    { provider: "api", model: "m", usage: { input_tokens: 1000, output_tokens: 200 }, estimatedCost: 7, price: { input: 1, output: 1 } },
  ] };
  priceUnpricedRuns(job, { modelPrices: { "api:m": { input: 2, output: 10 } } });
  assert.equal(job.runs[0].estimatedCost, 0.004);
  assert.ok(job.runs[0].pricedAt);
  assert.equal(job.runs[1].estimatedCost, 7);
  assert.equal(job.unpricedRuns, 0);
});
test("fallback is opt-in and failed attempts preserve their usage", async () => {
  let settings = {
    provider: "codex",
    model: "first",
    enableFallbacks: false,
    fallbacks: { build: [{ provider: "local", model: "second", effort: "" }] },
  };
  const runner = new AgentRunner({ settings: () => settings }, {}),
    calls = [];
  runner.attempt = async ({ route, job }) => {
    calls.push(route.model);
    job.usage = { input_tokens: 10, output_tokens: 2 };
    if (route.model === "first") throw Error("quota");
    return { ok: true };
  };
  const first = {};
  await assert.rejects(
    runner.generate({ job: first, emit: () => {} }),
    /quota/,
  );
  assert.deepEqual(calls, ["first"]);
  assert.equal(first.usage.input_tokens, 10);
  settings = { ...settings, enableFallbacks: true };
  const second = {};
  assert.deepEqual(await runner.generate({ job: second, emit: () => {} }), {
    ok: true,
  });
  assert.equal(second.usage.input_tokens, 20);
  assert.equal(second.runs.length, 2);
  assert.equal(second.runs[0].status, "error");
  assert.equal(second.runs[1].billing, "local");
});
test("cached usage is normalized per protocol and prices persist per model", () => {
  const claude = normalizeUsage({
    input_tokens: 100,
    output_tokens: 10,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  });
  assert.equal(claude.input_tokens, 350);
  assert.deepEqual(normalizeUsage(claude), claude);
  const openai = normalizeUsage({
    prompt_tokens: 350,
    completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 200 },
  });
  assert.equal(openai.input_tokens, 350);
  const result = estimateUsage(claude, "claude", "chosen", {
    modelPrices: {
      "claude:chosen": { input: 2, output: 10, cached: 0.2, cacheWrite: 3 },
    },
  });
  assert.equal(result.estimatedCost, 0.00049);
  assert.equal(result.billing, "subscription");
  assert.equal(
    estimateUsage(openai, "api", "unknown", {}).estimatedCost,
    undefined,
  );
});

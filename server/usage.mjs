export function normalizeUsage(raw = {}) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const cached = n(
    raw.cached_input_tokens ??
      raw.cache_read_input_tokens ??
      raw.prompt_tokens_details?.cached_tokens,
  );
  const written = n(raw.cache_creation_input_tokens ?? raw.cache_write_tokens);
  // Claude reports uncached input separately; Codex/OpenAI include cached input.
  return {
    input_tokens:
      n(raw.input_tokens ?? raw.prompt_tokens) +
      (raw.cache_read_input_tokens != null ? cached + written : 0),
    output_tokens: n(raw.output_tokens ?? raw.completion_tokens),
    cached_input_tokens: cached,
    cache_write_tokens: written,
  };
}
export function estimateUsage(usage, provider, model, settings) {
  if (provider === "local") return { estimatedCost: 0, billing: "local" };
  const price =
    settings.modelPrices?.[`${provider}:${model || "default"}`] ||
    (settings.inputPrice != null || settings.outputPrice != null
      ? { input: settings.inputPrice, output: settings.outputPrice }
      : null);
  const billing = provider === "api" ? "metered" : "subscription";
  if (!price || price.input == null || price.output == null) return { billing };
  const cached = Math.min(usage.input_tokens, usage.cached_input_tokens || 0);
  const written = Math.min(
    usage.input_tokens - cached,
    usage.cache_write_tokens || 0,
  );
  return {
    billing,
    price: { ...price },
    estimatedCost:
      ((usage.input_tokens - cached - written) * Number(price.input) +
        cached * Number(price.cached ?? price.input) +
        written * Number(price.cacheWrite ?? price.input) +
        usage.output_tokens * Number(price.output)) /
      1e6,
  };
}
export function recordRun(job, route, role, started, usage, settings, error) {
  const run = {
    ...route,
    role,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    usage: normalizeUsage(usage),
    status: error ? "error" : "done",
    ...(error ? { error: error.message } : {}),
  };
  Object.assign(
    run,
    estimateUsage(run.usage, route.provider, route.model, settings),
  );
  job.runs = [...(job.runs || []), run];
  job.estimatedCost = job.runs.reduce(
    (sum, r) => sum + (r.estimatedCost || 0),
    0,
  );
  job.unpricedRuns = job.runs.filter((r) => r.estimatedCost == null).length;
  return run;
}
export function usageReport(jobs) {
  // Parent routine jobs contain their own calls; child calls stay on child jobs.
  return jobs.flatMap((j) =>
    (j.runs || []).map((r, i) => ({
      ...r,
      id: `${j.id}:${i}`,
      jobId: j.id,
      projectId: j.projectId,
      action: j.action,
    })),
  );
}
export function priceUnpricedRuns(job, settings) {
  for (const run of job.runs || []) {
    if (run.estimatedCost != null) continue;
    const estimate = estimateUsage(run.usage, run.provider, run.model, settings);
    if (estimate.estimatedCost != null)
      Object.assign(run, estimate, { pricedAt: new Date().toISOString() });
  }
  job.estimatedCost = (job.runs || []).reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
  job.unpricedRuns = (job.runs || []).filter((r) => r.estimatedCost == null).length;
}

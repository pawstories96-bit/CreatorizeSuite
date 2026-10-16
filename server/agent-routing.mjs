export const providers = ["codex", "claude", "anthropic", "local", "api"];
export function snapshotAgentSettings(settings) {
  return structuredClone({
    provider: settings.provider || "codex",
    model: settings.model || "",
    localModel: settings.localModel || "",
    effort: settings.effort ?? "medium",
    roles: settings.roles || {},
    fallbacks: settings.fallbacks || {},
    enableFallbacks: settings.enableFallbacks === true,
    liteMode: settings.liteMode === true,
  });
}
export function capabilityFor(settings, route, calibrations = []) {
  const calibration = calibrations.find(
    (c) =>
      c.provider === route.provider && c.model === (route.model || "default"),
  );
  return {
    tier: calibration?.tier || null,
    vision: calibration?.vision === true,
    lite:
      settings.liteMode === true ||
      calibration?.tier === "C" ||
      (!calibration && route.provider === "local"),
  };
}
export function normalizeAgent(value) {
  if (value == null) return null;
  if (!providers.includes(value.provider))
    throw Error("Choose a supported provider");
  if (typeof value.model !== "string" || value.model.length > 200)
    throw Error("Invalid model selection");
  if (
    value.effort &&
    ![
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].includes(value.effort)
  )
    throw Error("Invalid effort level");
  return {
    provider: value.provider,
    model: value.model.trim(),
    effort: value.effort || "",
  };
}
export function resolveAgentRoute(settings, role, ...overrides) {
  let route = {
    provider: settings.provider || "codex",
    model:
      settings.provider === "local"
        ? settings.localModel || ""
        : settings.model || "",
    effort: settings.effort ?? "medium",
  };
  const roleRoute =
    settings.roles?.[role] ||
    (role === "research" ? settings.roles?.script : null);
  for (const override of [roleRoute, ...overrides]) {
    if (!override) continue;
    if (override.provider && override.provider !== route.provider)
      route = { provider: override.provider, model: "", effort: "" };
    if (Object.hasOwn(override, "model")) route.model = override.model || "";
    if (Object.hasOwn(override, "effort")) route.effort = override.effort || "";
  }
  // An explicitly configured reviewer remains independent of the builder.
  if (role === "qa" && roleRoute?.provider) {
    route = {
      provider: roleRoute.provider,
      model: roleRoute.model || "",
      effort: roleRoute.effort || "",
    };
  }
  return route;
}

export function resolveAgentRoutes(settings, role, ...overrides) {
  const primary = resolveAgentRoute(settings, role, ...overrides);
  const fallbacks = settings.enableFallbacks
    ? settings.fallbacks?.[role] ||
      (role === "research" ? settings.fallbacks?.script : []) ||
      []
    : [];
  const routes = [
    primary,
    ...fallbacks.slice(0, 4).map(normalizeAgent).filter(Boolean),
  ];
  return [
    ...new Map(
      routes.map((r) => [`${r.provider}:${r.model}:${r.effort}`, r]),
    ).values(),
  ];
}

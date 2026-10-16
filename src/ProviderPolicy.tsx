import { useState } from "react";
import { ModelSelect, providerNames } from "./ModelSelect";
import { Button } from "./ui";
export function ProviderPolicy({
  settings,
  set,
}: {
  settings: any;
  set: (key: string, value: any) => void;
}) {
  const [role, setRole] = useState("build"),
    [provider, setProvider] = useState("codex"),
    [model, setModel] = useState("");
  const chain = settings.fallbacks?.[role] || [];
  const key = `${provider}:${model || "default"}`,
    price = settings.modelPrices?.[key] || {};
  return (
    <section className="panel settings-section">
      <div className="section-head">
        <div>
          <h2>Fallbacks & model pricing</h2>
          <p>
            Saved with your Connection settings. Fallbacks retry the current
            task before accepting its output.
          </p>
        </div>
      </div>
      <h3>Workspace routing presets</h3>
      <div className="row">
        {[
          ["All Codex", "codex"],
          ["All Claude", "claude"],
          ["Hybrid", "hybrid"],
          ["Local only", "local"],
        ].map(([label, preset]) => (
          <Button
            key={preset}
            small
            onClick={() => {
              const provider = preset === "hybrid" ? "codex" : preset;
              set("provider", provider);
              set("model", "");
              set(
                "roles",
                preset === "hybrid"
                  ? {
                      build: { provider: "claude", model: "", effort: "" },
                      edit: { provider: "claude", model: "", effort: "" },
                      qa: { provider: "codex", model: "", effort: "" },
                    }
                  : {},
              );
              set("enableFallbacks", false);
              set("liteMode", preset === "local");
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="form-hint">
        Save Connections to apply a preset. Local only uses your selected local
        model and requires its server to be running. Project-specific model
        choices take priority.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!settings.liteMode}
          onChange={(e) => set("liteMode", e.target.checked)}
        />
        Prefer Lite mode: simpler scenes for smaller models. Uncalibrated local
        models and Tier C models use this automatically.
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!settings.enableFallbacks}
          onChange={(e) => set("enableFallbacks", e.target.checked)}
        />{" "}
        Allow the fallback models below when a provider fails or reaches its
        limit
      </label>
      <div className="form-grid">
        <label>
          Task
          <select
            aria-label="Fallback task"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {[
              "script",
              "research",
              "storyboard",
              "build",
              "edit",
              "ultra",
              "qa",
              "thumbnail",
              "metadata",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select
            aria-label="Fallback provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel("");
            }}
          >
            {Object.entries(providerNames).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <ModelSelect
          provider={provider}
          value={model}
          onChange={setModel}
          label="Fallback / priced model"
        />
      </div>
      <Button
        disabled={
          chain.length >= 4 || (["api", "local"].includes(provider) && !model)
        }
        onClick={() =>
          set("fallbacks", {
            ...settings.fallbacks,
            [role]: [...chain, { provider, model, effort: "" }],
          })
        }
      >
        Add to fallback chain
      </Button>
      <ol>
        {chain.map((r: any, i: number) => (
          <li key={i}>
            {providerNames[r.provider]} · {r.model || "Provider default"}{" "}
            <Button
              small
              onClick={() =>
                set("fallbacks", {
                  ...settings.fallbacks,
                  [role]: chain.filter((_: any, n: number) => n !== i),
                })
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <label>
        Research search endpoint (optional SearXNG JSON search URL)
        <input
          placeholder="https://your-search-server/search"
          value={settings.searchUrl || ""}
          onChange={(e) => set("searchUrl", e.target.value)}
        />
      </label>
      <p className="form-hint">
        Without an endpoint, agent research tools use Wikipedia for source
        discovery and can retrieve public primary-source pages directly.
      </p>
      <h3>
        Prices for {providerNames[provider]} · {model || "default"}
      </h3>
      <p className="form-hint">
        USD per million tokens. Leave blank if unknown. Saved estimates retain
        the price used at the time of each run.
      </p>
      <div className="form-grid">
        {[
          ["input", "Input"],
          ["output", "Output"],
          ["cached", "Cached input"],
          ["cacheWrite", "Cache writes"],
        ].map(([id, label]) => (
          <label key={id}>
            {label}
            <input
              aria-label={`${label} price`}
              type="number"
              min="0"
              step="0.01"
              value={price[id] ?? ""}
              onChange={(e) =>
                set("modelPrices", {
                  ...settings.modelPrices,
                  [key]: {
                    ...price,
                    [id]: e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

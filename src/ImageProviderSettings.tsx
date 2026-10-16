import { useState } from "react";
import { api } from "./types";
import { Button } from "./ui";
export function ImageProviderSettings({
  settings,
  set,
}: {
  settings: any;
  set: (key: string, value: any) => void;
}) {
  const [models, setModels] = useState<any[]>([]),
    [checkpoints, setCheckpoints] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("text-to-image"),
    [cursor, setCursor] = useState<string | null>(null),
    [source, setSource] = useState(""),
    [flow, setFlow] = useState<any>(null),
    [parameters, setParameters] = useState<string | null>(null);
  const provider = settings.imageProvider || "api",
    cloud = ["fal", "higgsfield"].includes(provider),
    modelKey =
      provider + (category === "image-to-image" ? "EditModel" : "Model");
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const fetchModels = (more = false) =>
    act(async () => {
      const result = await api(
        `/image-models?provider=${provider}&category=${category}&q=${encodeURIComponent(query)}${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setModels((previous) =>
        more
          ? [
              ...new Map(
                [...previous, ...result.models].map((m: any) => [m.id, m]),
              ).values(),
            ]
          : result.models,
      );
      setCursor(result.nextCursor);
      setSource(result.source);
    });
  return (
    <section className="panel settings-section">
      <h2>Image generation</h2>
      <label>
        Image provider
        <select
          value={provider}
          onChange={(e) => {
            set("imageProvider", e.target.value);
            setModels([]);
            setSource("");
            setParameters(null);
            setError("");
          }}
        >
          <option value="api">Configured image API</option>
          <option value="comfy">ComfyUI local server</option>
          <option value="fal">fal API</option>
          <option value="higgsfield">Higgsfield API</option>
          <option value="flow">Google Flow browser</option>
        </select>
      </label>
      {cloud && (
        <>
          <div className="form-grid">
            <label>
              Image operation
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setModels([]);
                  setCursor(null);
                }}
              >
                <option value="text-to-image">Text to image</option>
                <option value="image-to-image">With reference images</option>
              </select>
            </label>
            <label>
              Search image models
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or description"
              />
            </label>
            <Button disabled={busy} onClick={() => void fetchModels()}>
              Fetch available image models
            </Button>
            <label>
              {category === "image-to-image"
                ? "Reference image model"
                : "Text image model"}
              <select
                value={settings[modelKey] || ""}
                onChange={(e) => set(modelKey, e.target.value)}
              >
                <option value="">Choose a fetched model</option>
                {settings[modelKey] &&
                  !models.some((m) => m.id === settings[modelKey]) && (
                    <option value={settings[modelKey]}>
                      {settings[modelKey]} (saved)
                    </option>
                  )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cursor && (
            <Button disabled={busy} onClick={() => void fetchModels(true)}>
              Load more image models
            </Button>
          )}
          {source && (
            <p className="form-hint">
              {models.length} models · {source}
            </p>
          )}
          {provider === "higgsfield" && (
            <p className="form-hint">
              The public schema is a partial catalog. Reference generation
              requires a model whose schema accepts images. Your API access can
              differ from the Higgsfield website subscription.
            </p>
          )}
          <details>
            <summary>Model parameters</summary>
            <Button
              disabled={busy || !settings[modelKey]}
              onClick={() =>
                void act(async () => {
                  const result = await api(
                    `/image-models?provider=${provider}&model=${encodeURIComponent(settings[modelKey])}`,
                  );
                  const schema = result.models.find(
                    (m: any) => m.id === settings[modelKey],
                  )?.schema;
                  setSource(
                    schema
                      ? `Supported parameters: ${Object.keys(schema.properties).join(", ")}. Required: ${(schema.required || []).join(", ")}`
                      : "This model has no schema",
                  );
                })
              }
            >
              Check selected model schema
            </Button>
            <label>
              Optional model parameters (JSON)
              <textarea
                rows={4}
                value={
                  parameters ??
                  JSON.stringify(
                    settings[provider + "Parameters"] || {},
                    null,
                    2,
                  )
                }
                onChange={(e) => setParameters(e.target.value)}
                onBlur={() => {
                  if (parameters == null) return;
                  try {
                    const value = JSON.parse(parameters);
                    if (
                      !value ||
                      Array.isArray(value) ||
                      typeof value !== "object"
                    )
                      throw Error("Use a JSON object");
                    set(provider + "Parameters", value);
                    setError("");
                  } catch (e: any) {
                    setError("Model parameters: " + e.message);
                  }
                }}
              />
            </label>
            <p className="form-hint">
              Only parameters advertised by the selected model are sent. Prompts
              and reference images come from your project.
            </p>
          </details>
          <p className="form-hint">
            Add this provider's API key in Connections, then save settings.
            Requests use the provider's API billing.
          </p>
        </>
      )}
      {provider === "comfy" && (
        <>
          <div className="form-grid">
            <label>
              ComfyUI URL
              <input
                value={settings.comfyUrl || "http://127.0.0.1:8188"}
                onChange={(e) => set("comfyUrl", e.target.value)}
              />
            </label>
            <label>
              Installed checkpoint
              <select
                value={settings.comfyModel || ""}
                onChange={(e) => set("comfyModel", e.target.value)}
              >
                <option value="">Choose a checkpoint</option>
                {settings.comfyModel &&
                  !checkpoints.includes(settings.comfyModel) && (
                    <option>{settings.comfyModel}</option>
                  )}
                {checkpoints.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api("/settings", "POST", {
                    comfyUrl: settings.comfyUrl,
                  });
                  setCheckpoints(await api("/comfy/models"));
                })
              }
            >
              Fetch installed checkpoints
            </Button>
          </div>
          <label>
            Optional workflow exported in ComfyUI API format
            <textarea
              rows={5}
              value={settings.comfyWorkflow || ""}
              onChange={(e) => set("comfyWorkflow", e.target.value)}
              placeholder="Leave empty for the built-in text-to-image / single-reference workflow"
            />
          </label>
          <p className="form-hint">
            Custom workflows can use {"{{prompt}}"}, {"{{model}}"} and{" "}
            {"{{reference:0}}"} placeholders. Save settings after choosing your
            checkpoint.
          </p>
        </>
      )}
      {provider === "flow" && (
        <>
          <label>
            Google Flow project URL
            <input
              value={settings.flowProjectUrl || ""}
              onChange={(e) => set("flowProjectUrl", e.target.value)}
              placeholder="https://labs.google/fx/tools/flow/project/…"
            />
          </label>
          <div className="row">
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api("/settings", "POST", {
                    flowProjectUrl: settings.flowProjectUrl || "",
                  });
                  setFlow(await api("/flow/open", "POST", {}));
                })
              }
            >
              Open Flow browser
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => setFlow(await api("/flow/status")))
              }
            >
              Check Flow connection
            </Button>
            <Button
              disabled={busy || flow?.busy}
              onClick={() =>
                void act(async () => {
                  await api("/flow/close", "POST", {});
                  setFlow(null);
                })
              }
            >
              Close Flow browser
            </Button>
          </div>
          <p className="form-hint">
            Sign in in the dedicated browser, open a project and select Image
            mode. Choose the model and output ratio there. Keep the browser open
            while Creatorize sends prompts and imports completed images. Your
            Flow plan and credits apply.
          </p>
          {flow && (
            <p className={flow.ready ? "notice" : "form-hint"}>
              {flow.message}
            </p>
          )}
          <details>
            <summary>Browser controls (if Flow's layout changes)</summary>
            {[
              ["flowPromptSelector", "Prompt CSS selector"],
              ["flowGenerateSelector", "Generate Image CSS selector"],
              ["flowUploadSelector", "Reference file input CSS selector"],
              ["flowResultSelector", "Generated image CSS selector"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={settings[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="Use automatic detection"
                />
              </label>
            ))}
            <p className="form-hint">
              Selectors must identify the public page controls. Save settings
              before testing. If sign-in, account access or a challenge needs
              attention, complete it in the browser.
            </p>
          </details>
        </>
      )}
      {provider === "api" && (
        <p className="form-hint">
          Set the compatible image model and generation/edit endpoints below.
          Store its API key in Connections.
        </p>
      )}
      {error && (
        <p role="alert" className="model-error">
          {error}
        </p>
      )}
    </section>
  );
}

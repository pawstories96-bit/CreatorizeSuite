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
  const [models, setModels] = useState<string[]>([]),
    [error, setError] = useState("");
  return (
    <section className="panel settings-section">
      <h2>Local image generation</h2>
      <div className="form-grid">
        <label>
          Image provider
          <select
            value={settings.imageProvider || "api"}
            onChange={(e) => set("imageProvider", e.target.value)}
          >
            <option value="api">Configured image API</option>
            <option value="comfy">ComfyUI local server</option>
          </select>
        </label>
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
            {settings.comfyModel && !models.includes(settings.comfyModel) && (
              <option>{settings.comfyModel}</option>
            )}
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <Button
          onClick={async () => {
            try {
              await api("/settings", "POST", { comfyUrl: settings.comfyUrl });
              setModels(await api("/comfy/models"));
              setError("");
            } catch (e: any) {
              setError(e.message);
            }
          }}
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
      {error && (
        <p role="alert" className="model-error">
          {error}
        </p>
      )}
    </section>
  );
}

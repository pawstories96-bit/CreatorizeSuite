import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, Cpu } from "lucide-react";
import { api, type Project, type State } from "./types";
import { Modal, Button } from "./ui";
type Model = {
  id: string;
  name: string;
  description: string;
  efforts: string[];
  defaultEffort?: string;
  isDefault?: boolean;
};
type Catalog = {
  models: Model[];
  source: string;
  fetchedAt: string;
  stale?: boolean;
  warning?: string;
};
export const providerNames: Record<string, string> = {
  codex: "ChatGPT / Codex",
  claude: "Claude Code",
  local: "Local model",
  api: "API provider",
};
export function useModelCatalog(provider: string, endpoint?: string) {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    const query = new URLSearchParams({
      ...(endpoint ? { endpoint } : {}),
      ...(revision ? { refresh: "true" } : {}),
    });
    api(`/models/${provider}?${query}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, endpoint, revision]);
  return { data, error, loading, refresh: () => setRevision((n) => n + 1) };
}
export function ModelSelect({
  provider,
  value,
  onChange,
  endpoint,
  label = "Model",
  effort,
  onEffortChange,
}: {
  provider: string;
  value: string;
  onChange: (value: string) => void;
  endpoint?: string;
  label?: string;
  effort?: string;
  onEffortChange?: (value: string) => void;
}) {
  const { data, error, loading, refresh } = useModelCatalog(provider, endpoint);
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState(false);
  const selected = data?.models.find((m) => m.id === value);
  const effective =
    selected || (!value ? data?.models.find((m) => m.isDefault) : null);
  const models =
    data?.models.filter(
      (m) =>
        m.id === value ||
        `${m.name} ${m.id} ${m.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  useEffect(() => {
    setSearch("");
    setCustom(false);
  }, [provider]);
  return (
    <div className="model-field">
      <label>{label}</label>
      {(data?.models.length || 0) > 12 && (
        <input
          aria-label={`Search ${label.toLowerCase()}s`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search available models…"
        />
      )}
      <div className="model-select-row">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            const chosen = data?.models.find((m) => m.id === e.target.value);
            if (onEffortChange && effort && !chosen?.efforts.includes(effort))
              onEffortChange(chosen?.defaultEffort || "");
          }}
        >
          <option value="">
            {["local", "api"].includes(provider)
              ? "Choose a model…"
              : "Provider default"}
          </option>
          {value && !selected && (
            <option value={value}>{value} · current selection</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.name !== m.id &&
              data?.models.filter((other) => other.name === m.name).length! > 1
                ? ` (${m.id})`
                : ""}
              {m.isDefault ? " · recommended" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          title={`Refresh ${label.toLowerCase()} list`}
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>
      {loading && (
        <small className="form-hint">
          Fetching models from {providerNames[provider]}…
        </small>
      )}
      {effective?.description && (
        <small className="model-description">{effective.description}</small>
      )}
      {data && !loading && (
        <small className="form-hint">
          {data.models.length} models from {data.source}
          {data.stale ? " · cached list" : ""}
        </small>
      )}
      {(error || data?.warning) && (
        <small role="status" className="model-error">
          {error || data?.warning}
        </small>
      )}
      {data && !data.models.length && (
        <small className="form-hint">
          No models were returned. Check this provider’s setup and refresh.
        </small>
      )}
      {onEffortChange && (
        <label>
          Thinking effort
          <select
            aria-label="Thinking effort"
            value={effort || ""}
            onChange={(e) => onEffortChange(e.target.value)}
          >
            <option value="">Provider default</option>
            {effort && !effective?.efforts.includes(effort) && (
              <option value={effort}>{effort} · current setting</option>
            )}
            {effective?.efforts.map((level) => (
              <option key={level} value={level}>
                {level[0].toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="text-link model-custom-toggle"
        onClick={() => setCustom(!custom)}
      >
        {custom ? "Hide custom model ID" : "Enter a custom model ID"}
      </button>
      {custom && (
        <input
          aria-label="Custom model ID"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="For a model not advertised by the provider"
        />
      )}
    </div>
  );
}

export function ProjectModelPicker({
  project,
  state,
  refresh,
  notify,
  running,
}: {
  project: Project;
  state: State;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("workspace");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [saving, setSaving] = useState(false);
  const currentProvider =
    project.agent?.provider || state.settings.provider || "codex";
  const currentModel = project.agent?.model || "";
  const catalog = useModelCatalog(currentProvider);
  const label = project.agent
    ? catalog.data?.models.find((m) => m.id === currentModel)?.name ||
      currentModel ||
      "Provider default"
    : "Workspace defaults";
  const show = () => {
    setProvider(project.agent?.provider || "workspace");
    setModel(project.agent?.model || "");
    setEffort(project.agent?.effort || "");
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api(`/projects/${project.id}/agent`, "POST", {
        agent: provider === "workspace" ? null : { provider, model, effort },
      });
      await refresh();
      setOpen(false);
      notify("Project model saved for new jobs");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button
        className="model-chip"
        title="Change project model"
        aria-label="Change project model"
        onClick={show}
      >
        <Cpu size={13} />
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Modal title="Project model" onClose={() => setOpen(false)}>
          <div className="modal-body form-stack">
            <p>
              Choose the AI used for new jobs in{" "}
              <strong>{project.title}</strong>.
            </p>
            <label>
              Provider
              <select
                aria-label="Project provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel("");
                  setEffort("");
                }}
              >
                <option value="workspace">
                  Use workspace defaults and role routing
                </option>
                {Object.entries(providerNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {provider !== "workspace" && (
              <ModelSelect
                key={provider}
                provider={provider}
                value={model}
                onChange={setModel}
                effort={effort}
                onEffortChange={setEffort}
                label="Project model"
              />
            )}
            <p className="notice">
              {running ? "Your current job keeps its existing model. " : ""}This
              choice applies to new jobs in this project. Already queued jobs
              keep their saved settings. Workspace defaults and other projects
              stay unchanged.
            </p>
          </div>
          <footer>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              primary
              disabled={
                saving || (["local", "api"].includes(provider) && !model.trim())
              }
              onClick={save}
            >
              {saving ? "Saving…" : "Use for this project"}
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}

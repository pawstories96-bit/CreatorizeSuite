import { useEffect, useRef, useState } from "react";
import { ThumbnailBoard } from "./ThumbnailBoard";
import { ThumbnailHelper } from "./ThumbnailHelper";
import { AudienceLearning } from "./AudienceLearning";
import { ModelSelect } from "./ModelSelect";
import { ProviderPolicy } from "./ProviderPolicy";
import { UsageDashboard } from "./UsageDashboard";
import { ImageProviderSettings } from "./ImageProviderSettings";
import {
  Plus,
  Sparkles,
  Brain,
  Trash2,
  Copy,
  Check,
  Plug,
  RefreshCw,
  ArrowUpRight,
  FolderOpen,
  Download,
  Film,
  Play,
  Square,
  Workflow,
  Image,
  Upload,
  Settings,
  Save,
  Monitor,
  ShieldCheck,
  TvMinimal,
  ChartNoAxesCombined,
  KeyRound,
  ExternalLink,
  ArrowRight,
  FileText,
  Clock,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, ago, time, media, type Project, type State } from "./types";
import {
  Button,
  Modal,
  PageHead,
  Empty,
  Badge,
  StyleArt,
  ExternalLink as Link,
} from "./ui";
export function WorkspacePages({
  page,
  state,
  active,
  refresh,
  notify,
  go,
  open,
}: {
  page: string;
  state: State;
  active?: Project;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  go: (s: string) => void;
  open: (p: Project) => void;
}) {
  const [modal, setModal] = useState(""),
    [rule, setRule] = useState(""),
    [scope, setScope] = useState("global"),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [settings, setSettings] = useState<any>({}),
    [connections, setConnections] = useState<any[]>([]),
    [hardware, setHardware] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState("apiKey"),
    [secret, setSecret] = useState(""),
    [selectedRoutine, setSelectedRoutine] = useState(""),
    [analytics, setAnalytics] = useState<any>(null),
    [projectId, setProjectId] = useState(
      localStorage.getItem("thumbnailProject") || "",
    ),
    [imagePrompt, setImagePrompt] = useState(""),
    [boardView, setBoardView] = useState(true),
    [styleId, setStyleId] = useState("flat");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    localStorage.setItem("thumbnailProject", projectId);
  }, [projectId]);
  const act = async (fn: () => Promise<any>, message?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      await refresh();
      if (message) notify(message);
      return r;
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setSettings(state.settings);
  }, [page, state.settings.id]);
  useEffect(() => {
    if (page === "Connections")
      api("/connections")
        .then(setConnections)
        .catch((e) => notify(e.message));
    if (page === "Settings")
      api("/hardware")
        .then(setHardware)
        .catch((e) => notify(e.message));
    if (page === "YouTube" && state.settings.vault?.google)
      api("/youtube/analytics")
        .then(setAnalytics)
        .catch((e) => notify(e.message));
  }, [page]);
  const saveSettings = () =>
    act(() => api("/settings", "POST", settings), "Settings saved");
  const set = (k: string, v: any) =>
    setSettings((s: any) => ({ ...s, [k]: v }));
  if (page === "Routines")
    return <RoutinePage state={state} refresh={refresh} notify={notify} />;
  if (page === "Usage")
    return (
      <div className="page">
        <UsageDashboard state={state} />
      </div>
    );
  return (
    <div className="page">
      {page === "Styles" && (
        <>
          <PageHead
            eyebrow="YOUR VISUAL LANGUAGE"
            title="Style library"
            description="Five distinct starting points. Make any of them your own."
          >
            <Button
              onClick={() => {
                setName("");
                setModal("style");
              }}
            >
              <Plus size={16} />
              Customize a style
            </Button>
          </PageHead>
          <div className="styles-grid">
            {state.styles.map((s) => (
              <article key={s.id} className="style-card">
                <StyleArt style={s.baseStyle || s.id} large />
                <div className="style-content">
                  <div className="row spread">
                    <h2>{s.name}</h2>
                    <Badge>{s.baseStyle ? "Custom" : "Built-in"}</Badge>
                  </div>
                  <p>{s.description}</p>
                  <div className="row spread">
                    <small>{s.look} · 16:9 / 9:16</small>
                    <button
                      className="text-link"
                      onClick={() => {
                        setStyleId(s.id);
                        setName(s.name + " custom");
                        setDescription(s.description);
                        setModal("style");
                      }}
                    >
                      <Copy size={14} />
                      Customize
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="info-banner">
            <Sparkles size={18} />
            <div>
              <strong>Start with a style. Finish with your signature.</strong>
              <p>
                Your creative direction and saved memory rules shape every scene
                the agent builds.
              </p>
            </div>
          </div>
        </>
      )}
      {page === "Memory" && (
        <>
          <PageHead
            eyebrow="A STUDIO THAT LEARNS YOUR TASTE"
            title="Creative memory"
            description="The rules and preferences your agent brings into every build."
          >
            <Button
              primary
              onClick={() => {
                setRule("");
                setModal("rule");
              }}
            >
              <Plus size={16} />
              Add a rule
            </Button>
          </PageHead>
          <div className="filter-bar">
            <div className="tabs">
              <button
                className={scope === "global" ? "selected" : ""}
                onClick={() => setScope("global")}
              >
                All projects
              </button>
              <button
                className={scope === "project" ? "selected" : ""}
                onClick={() => setScope("project")}
              >
                This project
              </button>
            </div>
            <span className="subtle">{state.memory.length} saved rules</span>
          </div>
          {state.memoryProposals?.map((r) => (
            <div className="panel rule-card" key={r.id}>
              <div>
                <strong>
                  Suggested rule · {r.projectId ? "project" : "all projects"}
                </strong>
                <p>{r.text}</p>
              </div>
              <Button
                onClick={() =>
                  act(
                    () => api(`/memory-proposals/${r.id}/approve`, "POST"),
                    "Rule approved",
                  )
                }
              >
                Approve
              </Button>
              <Button
                onClick={() =>
                  act(() => api(`/memory-proposals/${r.id}/dismiss`, "POST"))
                }
              >
                Dismiss
              </Button>
            </div>
          ))}
          {state.memory.filter((r) =>
            scope === "global" ? !r.projectId : r.projectId === active?.id,
          ).length ? (
            <div className="rule-list">
              {state.memory
                .filter((r) =>
                  scope === "global"
                    ? !r.projectId
                    : r.projectId === active?.id,
                )
                .map((r) => (
                  <div className="panel rule-card" key={r.id}>
                    <div className="rule-icon">
                      <Brain size={19} />
                    </div>
                    <div>
                      <p>{r.text}</p>
                      <small>
                        {r.projectId
                          ? state.projects.find((p) => p.id === r.projectId)
                              ?.title
                          : "Applied to every project"}{" "}
                        · {ago(r.updatedAt)}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      title="Delete rule"
                      onClick={() =>
                        act(
                          () => api("/memory/" + r.id, "DELETE"),
                          "Rule deleted",
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                icon={Brain}
                title="Your taste is the starting point"
                description="Save a preference once—readable text, warmer colors, a calmer pace—and your agent will apply it on future builds."
                action={
                  <Button onClick={() => setModal("rule")}>
                    <Plus size={15} />
                    Write your first rule
                  </Button>
                }
              />
            </div>
          )}
        </>
      )}
      {page === "Renders" && (
        <>
          <PageHead
            eyebrow="READY FOR THE WORLD"
            title="Renders"
            description="Your export queue and finished videos, all in one place."
          >
            <Button onClick={() => act(() => api("/open-folder", "POST", {}))}>
              <FolderOpen size={16} />
              Open workspace
            </Button>
          </PageHead>
          {state.jobs.filter((j) => ["export", "trailer"].includes(j.action))
            .length ? (
            <div className="panel render-table">
              <div className="table-header">
                <span>Project</span>
                <span>Status</span>
                <span>Resolution</span>
                <span>File size</span>
                <span />
              </div>
              {state.jobs
                .filter((j) => ["export", "trailer"].includes(j.action))
                .map((j) => {
                  const p = state.projects.find((p) => p.id === j.projectId);
                  return (
                    <div className="table-row" key={j.id}>
                      <div>
                        <strong>{p?.title || "Deleted project"}</strong>
                        <small>{ago(j.createdAt)}</small>
                      </div>
                      <div>
                        <Badge status={j.status}>{j.status}</Badge>
                        {j.status === "running" && (
                          <progress max="100" value={j.progress} />
                        )}
                      </div>
                      <span>{j.resolution || "—"}</span>
                      <span>
                        {j.size ? (j.size / 1024 ** 2).toFixed(1) + " MB" : "—"}
                      </span>
                      <div className="row">
                        {j.output && p && (
                          <a
                            className="button small"
                            href={media(p, j.output)}
                            download
                          >
                            <Download size={14} />
                            MP4
                          </a>
                        )}
                        {["error", "stopped", "paused"].includes(j.status) && (
                          <Button
                            small
                            onClick={() =>
                              act(() => api(`/jobs/${j.id}/retry`, "POST"))
                            }
                          >
                            Retry
                          </Button>
                        )}
                        {j.status === "running" && (
                          <Button
                            small
                            onClick={() =>
                              act(() => api(`/jobs/${j.id}/stop`, "POST"))
                            }
                          >
                            Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="panel">
              <Empty
                icon={Film}
                title="The final frame is just the beginning"
                description="Export a video from the editor. Progress and finished files will appear here."
                action={
                  active && (
                    <Button onClick={() => open(active)}>
                      Go to editor <ArrowRight size={15} />
                    </Button>
                  )
                }
              />
            </div>
          )}
        </>
      )}
      {page === "Channels" && (
        <>
          <PageHead
            eyebrow="BUILT AROUND YOUR BRAND"
            title="Channels"
            description="Give each channel a consistent voice, style, and production workflow."
          >
            <Button
              primary
              onClick={() => {
                setName("");
                setDescription("");
                setModal("channel");
              }}
            >
              <Plus size={16} />
              Add channel
            </Button>
          </PageHead>
          {state.channels.length ? (
            <div className="channel-list">
              {state.channels.map((c) => (
                <section className="panel channel-panel" key={c.id}>
                  <div className="section-head">
                    <div className="row">
                      <div className="channel-avatar">{c.name.charAt(0)}</div>
                      <div>
                        <h2>{c.name}</h2>
                        <small>
                          {c.description || "Your channel workspace"}
                        </small>
                      </div>
                    </div>
                    <div className="row">
                      <Badge>
                        {c.youtubeId ? "YouTube connected" : "Local channel"}
                      </Badge>
                      <button
                        className="icon-button"
                        title="Delete channel"
                        onClick={() =>
                          act(() => api("/channels/" + c.id, "DELETE"))
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="workflow-board">
                    {[
                      "draft",
                      "editing",
                      "ready",
                      "scheduled",
                      "published",
                    ].map((status) => (
                      <div className="workflow-column" key={status}>
                        <div className="tiny-label">
                          {status}{" "}
                          <span>
                            {
                              state.projects.filter(
                                (p) =>
                                  p.channelId === c.id && p.status === status,
                              ).length
                            }
                          </span>
                        </div>
                        {state.projects
                          .filter(
                            (p) => p.channelId === c.id && p.status === status,
                          )
                          .map((p) => (
                            <button key={p.id} onClick={() => open(p)}>
                              {p.title}
                              <small>{p.shots.length} shots</small>
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                icon={TvMinimal}
                title="A home for every channel"
                description="Add your channel to organize projects and keep your creative direction consistent."
                action={
                  <Button onClick={() => setModal("channel")}>
                    <Plus size={15} />
                    Add your channel
                  </Button>
                }
              />
            </div>
          )}
        </>
      )}
      {page === "Thumbnails" && (
        <>
          <PageHead
            eyebrow="MAKE THE FIRST IMPRESSION COUNT"
            title="Thumbnails"
            description="Create, collect and choose the cover for your next story."
          >
            <Button onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
              Import image
            </Button>
            <Button
              primary
              disabled={!active}
              onClick={() => setModal("thumbnail")}
            >
              <Plus size={16} />
              Create thumbnail
            </Button>
          </PageHead>
          <div className="filter-bar">
            <div className="tabs">
              <button
                className={boardView ? "selected" : ""}
                onClick={() => setBoardView(true)}
              >
                Canvas
              </button>
              <button
                className={!boardView ? "selected" : ""}
                onClick={() => setBoardView(false)}
              >
                Project library
              </button>
            </div>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <ThumbnailHelper
            state={state}
            projectId={projectId}
            refresh={refresh}
            notify={notify}
          />
          {boardView ? (
            <ThumbnailBoard
              key={projectId}
              projectId={projectId}
              state={state}
              refresh={refresh}
              notify={notify}
            />
          ) : state.thumbnails.filter(
              (t) => !projectId || t.projectId === projectId,
            ).length ? (
            <div className="project-grid">
              {state.thumbnails
                .filter((t) => !projectId || t.projectId === projectId)
                .map((t) => {
                  const p = state.projects.find((p) => p.id === t.projectId);
                  return (
                    <article className="project-card" key={t.id}>
                      <div className="project-cover">
                        {p && <img src={media(p, t.path)} />}
                      </div>
                      <div className="project-info">
                        <h3>{t.name}</h3>
                        <small>
                          {t.provider || "Captured / imported"}
                          {t.model ? ` · ${t.model}` : ""}
                          {t.parentId ? " · regenerated variant" : ""}
                        </small>
                        {t.prompt && (
                          <Button
                            small
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  api("/thumbnails/generate", "POST", {
                                    projectId: t.projectId,
                                    prompt: t.prompt,
                                    parentId: t.id,
                                  }),
                                "New variant added to the library",
                              )
                            }
                          >
                            Regenerate variant
                          </Button>
                        )}
                        <div className="row spread">
                          <small>{ago(t.createdAt || t.updatedAt)}</small>
                          <Button
                            small
                            onClick={() =>
                              act(
                                () => api(`/thumbnails/${t.id}/assign`, "POST"),
                                "Thumbnail assigned",
                              )
                            }
                          >
                            <Check size={13} />
                            Use as thumbnail
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            <div className="panel">
              <Empty
                icon={Image}
                title="Give your story a cover"
                description="Capture a scene from your video, import an image, or generate a cover with your connected image provider."
                action={
                  active && (
                    <Button onClick={() => setModal("thumbnail")}>
                      <Plus size={15} />
                      Create thumbnail
                    </Button>
                  )
                }
              />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              const p =
                state.projects.find((p) => p.id === projectId) || active;
              if (!f) return;
              if (!p)
                return notify("Create a project before importing a thumbnail");
              const form = new FormData();
              form.append("file", f);
              const r = await act(() =>
                api(`/projects/${p.id}/asset`, "POST", form),
              );
              if (r)
                await act(
                  () =>
                    api("/thumbnails", "POST", {
                      projectId: p.id,
                      path: r.path,
                      name: f.name,
                      createdAt: new Date().toISOString(),
                    }),
                  "Image imported",
                );
              e.target.value = "";
            }}
          />
        </>
      )}
      {page === "Connections" && (
        <>
          <PageHead
            eyebrow="YOUR MODELS. YOUR CHOICE."
            title="Connections"
            description="Use your existing subscription, your own API key, or a model running locally."
          >
            <Button
              disabled={busy}
              onClick={() =>
                act(async () => setConnections(await api("/connections")))
              }
            >
              <RefreshCw size={15} />
              Refresh status
            </Button>
          </PageHead>
          <div className="connections-grid">
            {[
              {
                id: "codex",
                name: "ChatGPT / Codex",
                symbol: "◎",
                sub: "Your ChatGPT subscription",
                url: "https://developers.openai.com/codex/cli/",
              },
              {
                id: "claude",
                name: "Claude Code",
                symbol: "✳",
                sub: "Your Claude subscription",
                url: "https://code.claude.com/docs/en/setup",
              },
              {
                id: "local",
                name: "Local models",
                symbol: "⌘",
                sub: "Ollama, LM Studio and compatible servers",
                url: "https://ollama.com/download",
              },
            ].map((v) => {
              const c = connections.find((c) => c.id === v.id);
              return (
                <section className="panel connection-card" key={v.id}>
                  <div className="row spread">
                    <div className={"provider-symbol " + v.id}>{v.symbol}</div>
                    <Badge status={c?.signedIn ? "connected" : ""}>
                      {!c
                        ? "Checking…"
                        : c.signedIn
                          ? "Signed in"
                          : c.installed
                            ? "Sign-in required"
                            : "Not detected"}
                    </Badge>
                  </div>
                  <h2>{v.name}</h2>
                  <p>{v.sub}</p>
                  <code>{c?.version || c?.error || "Detecting runtime…"}</code>
                  <div className="row spread">
                    <button
                      className="text-link"
                      onClick={async () => {
                        await act(
                          () =>
                            api("/settings", "POST", {
                              ...settings,
                              provider: v.id,
                              model: "",
                              effort: "",
                            }),
                          "Provider selected",
                        );
                        set("provider", v.id);
                        set("model", "");
                        set("effort", "");
                      }}
                    >
                      {state.settings.provider === v.id ? (
                        <>
                          <Check size={14} />
                          Active provider
                        </>
                      ) : (
                        <>
                          Use this provider <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                    <Link href={v.url}>Setup guide</Link>
                  </div>
                </section>
              );
            })}
          </div>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>Runtime preferences</h2>
                <p>
                  Pick from models returned by your connected provider. Refresh
                  the list whenever your available models change.
                </p>
              </div>
              <Button small primary onClick={saveSettings}>
                <Save size={14} />
                Save
              </Button>
            </div>
            <div className="form-grid">
              <label>
                Active provider
                <select
                  value={settings.provider || "codex"}
                  onChange={(e) => {
                    set("provider", e.target.value);
                    set("model", "");
                    set("effort", "");
                  }}
                >
                  <option value="codex">ChatGPT / Codex</option>
                  <option value="claude">Claude Code</option>
                  <option value="local">Local model</option>
                  <option value="api">OpenAI-compatible API</option>
                </select>
              </label>
              <ModelSelect
                provider={settings.provider || "codex"}
                value={
                  (settings.provider === "local"
                    ? settings.localModel
                    : settings.model) || ""
                }
                onChange={(value) =>
                  set(
                    settings.provider === "local" ? "localModel" : "model",
                    value,
                  )
                }
                endpoint={
                  settings.provider === "local"
                    ? settings.localUrl
                    : settings.provider === "api"
                      ? settings.apiUrl
                      : undefined
                }
                effort={settings.effort || ""}
                onEffortChange={(value) => set("effort", value)}
              />
              <label>
                Local endpoint
                <input
                  value={settings.localUrl || ""}
                  onChange={(e) => set("localUrl", e.target.value)}
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </label>
              <label>
                API base URL
                <input
                  value={settings.apiUrl || ""}
                  onChange={(e) => set("apiUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label>
                Input price (USD per million tokens)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.inputPrice ?? ""}
                  onChange={(e) =>
                    set(
                      "inputPrice",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Optional estimate"
                />
              </label>
              <label>
                Output price (USD per million tokens)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.outputPrice ?? ""}
                  onChange={(e) =>
                    set(
                      "outputPrice",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Optional estimate"
                />
              </label>
            </div>
            <div className="row">
              <Button
                onClick={async () => {
                  await saveSettings();
                  await act(
                    () => api("/connections/test", "POST"),
                    "Smoke test queued. Results appear below.",
                  );
                }}
              >
                <Plug size={15} />
                Run connection test
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  await saveSettings();
                  await act(
                    () => api("/connections/calibrate", "POST"),
                    "Calibration queued. Results appear below.",
                  );
                }}
              >
                <ShieldCheck size={15} />
                Run calibration
              </Button>
              <small className="muted">
                Sends one short prompt through your selected provider.
              </small>
            </div>
            {state.jobs
              .filter((j) => ["test", "calibrate"].includes(j.action))
              .slice(0, 1)
              .map((j) => (
                <div className="notice" key={j.id}>
                  <Badge status={j.status}>{j.status}</Badge>{" "}
                  <strong>
                    {j.provider || "Provider"} ·{" "}
                    {new Date(
                      j.finishedAt || j.startedAt || j.createdAt,
                    ).toLocaleString()}
                  </strong>
                  <p>
                    {j.displayError ||
                      j.error ||
                      j.events
                        .filter(
                          (e) => e.type !== "usage" && e.type !== "diagnostic",
                        )
                        .at(-1)?.text}
                  </p>
                  {j.error && (
                    <details>
                      <summary>Diagnostic log</summary>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          maxHeight: 220,
                          overflow: "auto",
                        }}
                      >
                        {j.events
                          .slice(-12)
                          .map((e) => `${e.at} ${e.type}: ${e.text}`)
                          .join("\n")}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            {state.settings.calibrations?.map((c: any) => (
              <div className="notice" key={c.id}>
                <Badge status="done">Tier {c.tier}</Badge> {c.provider} ·{" "}
                {c.model} ·{" "}
                {c.vision
                  ? "Vision + scene checks"
                  : "Scene checks; programmatic QA"}{" "}
                · {ago(c.checkedAt)}
              </div>
            ))}
          </section>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>API keys & credentials</h2>
                <p>
                  Encrypted using your operating system. Secrets never appear in
                  project files.
                </p>
              </div>
              <Button onClick={() => setModal("credential")}>
                <KeyRound size={15} />
                Add credential
              </Button>
            </div>
            <div className="credential-status">
              <span>
                AI API key{" "}
                <Badge status={state.settings.vault?.apiKey ? "connected" : ""}>
                  {state.settings.vault?.apiKey ? "Saved" : "Not configured"}
                </Badge>
              </span>
              <span>
                ElevenLabs{" "}
                <Badge
                  status={state.settings.vault?.elevenlabs ? "connected" : ""}
                >
                  {state.settings.vault?.elevenlabs
                    ? "Saved"
                    : "Not configured"}
                </Badge>
              </span>
            </div>
          </section>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>Role router</h2>
                <p>
                  Override the provider and model for individual production
                  tasks.
                </p>
              </div>
              <Button small onClick={saveSettings}>
                Save routing
              </Button>
            </div>
            <div className="role-table">
              {[
                "script",
                "storyboard",
                "build",
                "edit",
                "ultra",
                "qa",
                "thumbnail",
                "metadata",
              ].map((role) => (
                <div className="role-row" key={role}>
                  <span>
                    {
                      (
                        {
                          script: "Research & script",
                          build: "Scene building",
                          edit: "Editing",
                          ultra: "UltraEdit",
                          qa: "Vision QA",
                          metadata: "Title & description",
                          storyboard: "Storyboard",
                          thumbnail: "Thumbnail helper",
                        } as any
                      )[role]
                    }
                  </span>
                  <select
                    value={settings.roles?.[role]?.provider || ""}
                    onChange={(e) =>
                      set("roles", {
                        ...settings.roles,
                        [role]: {
                          ...settings.roles?.[role],
                          provider: e.target.value,
                          model: "",
                        },
                      })
                    }
                  >
                    <option value="">Use default</option>
                    <option value="codex">Codex</option>
                    <option value="claude">Claude</option>
                    <option value="local">Local</option>
                    <option value="api">API</option>
                  </select>
                  <ModelSelect
                    provider={
                      settings.roles?.[role]?.provider ||
                      settings.provider ||
                      "codex"
                    }
                    label={`${role === "qa" ? "QA" : role[0].toUpperCase() + role.slice(1)} model`}
                    value={settings.roles?.[role]?.model || ""}
                    onChange={(value) =>
                      set("roles", {
                        ...settings.roles,
                        [role]: {
                          ...settings.roles?.[role],
                          model: value,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
          <ProviderPolicy settings={settings} set={set} />
        </>
      )}
      {page === "Settings" && (
        <>
          <ImageProviderSettings settings={settings} set={set} />
          <PageHead
            eyebrow="MAKE YOURSELF AT HOME"
            title="Settings"
            description="Tune your local studio to the way you work."
          >
            <Button primary onClick={saveSettings}>
              <Save size={15} />
              Save settings
            </Button>
          </PageHead>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>Workspace</h2>
                <p>Your projects are plain folders with a Git history.</p>
              </div>
              <FolderOpen size={20} />
            </div>
            <div className="workspace-path">
              <code>{state.workspace}</code>
              <Button
                small
                onClick={() => act(() => api("/open-folder", "POST", {}))}
              >
                Open folder
              </Button>
            </div>
          </section>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>Hardware profile</h2>
                <p>Detected on this machine.</p>
              </div>
              <Button
                small
                onClick={() =>
                  act(async () => setHardware(await api("/hardware")))
                }
              >
                <RefreshCw size={14} />
                Refresh
              </Button>
            </div>
            <div className="hardware-grid">
              {[
                ["Processor", hardware?.cpu],
                [
                  "Memory",
                  hardware
                    ? `${hardware.ramGB} GB · ${hardware.cores} threads`
                    : null,
                ],
                ["Graphics", hardware?.gpu],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v || "Detecting…"}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel settings-section">
            <div className="section-head">
              <div>
                <h2>Production defaults</h2>
                <p>Keep resource use comfortable while editing.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Concurrent jobs
                <select
                  value={settings.concurrency || 1}
                  onChange={(e) => set("concurrency", Number(e.target.value))}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} job{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!settings.closeToTray}
                  onChange={(e) => set("closeToTray", e.target.checked)}
                />
                Keep running in tray when the window closes
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!settings.startAtLogin}
                  onChange={(e) => set("startAtLogin", e.target.checked)}
                />
                Start with Windows (packaged app)
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!settings.notifications}
                  onChange={(e) => set("notifications", e.target.checked)}
                />
                Desktop notifications for completed and paused jobs
              </label>
              <label>
                Transcription model
                <select
                  value={settings.whisperModel || "base"}
                  onChange={(e) => set("whisperModel", e.target.value)}
                >
                  {["tiny", "base", "small", "medium", "large-v3"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Default voice provider
                <select
                  value={settings.ttsProvider || "windows"}
                  onChange={(e) => set("ttsProvider", e.target.value)}
                >
                  <option value="windows">Windows voice · Free</option>
                  <option value="piper">Piper · Local</option>
                  <option value="kokoro">Kokoro · Local server</option>
                  <option value="fish">Fish Audio</option>
                  <option value="elevenlabs">ElevenLabs</option>
                </select>
              </label>
              <label>
                ElevenLabs model <span>optional</span>
                <input
                  value={settings.ttsModel || ""}
                  onChange={(e) => set("ttsModel", e.target.value)}
                  placeholder="Provider default"
                />
              </label>
              <label>
                Image model
                <input
                  value={settings.imageModel || ""}
                  onChange={(e) => set("imageModel", e.target.value)}
                  placeholder="Model supported by your image endpoint"
                />
              </label>
              {[
                ["piperExecutable", "Piper executable path"],
                ["piperModel", "Piper ONNX voice path"],
                ["kokoroUrl", "Kokoro API base URL"],
                ["kokoroVoice", "Kokoro default voice"],
                ["fishVoice", "Fish reference voice ID"],
                ["fishModel", "Fish model (optional)"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={settings[key] || ""}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </label>
              ))}
              <label>
                Image API endpoint
                <input
                  value={settings.imageUrl || ""}
                  onChange={(e) => set("imageUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1/images/generations"
                />
              </label>
              <label>
                Image edit endpoint (reference images)
                <input
                  value={settings.imageEditUrl || ""}
                  onChange={(e) => set("imageEditUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1/images/edits"
                />
              </label>
            </div>
            <div className="notice">
              Local transcription uses faster-whisper. Its model downloads on
              first use. Windows voices work offline; available languages depend
              on installed voices.
            </div>
          </section>
          <div className="info-banner">
            <ShieldCheck size={20} />
            <div>
              <strong>Private by design</strong>
              <p>
                Rendering and storage stay on this machine. AI prompts are sent
                only to the provider you choose.
              </p>
            </div>
          </div>
        </>
      )}
      {page === "YouTube" && (
        <>
          <PageHead
            eyebrow="UNDERSTAND YOUR AUDIENCE"
            title="YouTube"
            description="Connect your channel to bring publishing and real performance into your studio."
          >
            <Button onClick={() => go("Connections")}>
              <Settings size={15} />
              Credentials
            </Button>
            <Button
              primary
              onClick={async () => {
                const r = await act(() => api("/youtube/connect", "POST"));
                if (r) window.open(r.url, "_blank");
              }}
            >
              <Plug size={16} />
              Connect YouTube
            </Button>
          </PageHead>
          {analytics ? (
            <>
              <div className="stats-grid">
                {[
                  ["Views", analytics.totals?.views],
                  [
                    "Watch time (min)",
                    analytics.totals?.estimatedMinutesWatched,
                  ],
                  ["Subscribers gained", analytics.totals?.subscribersGained],
                  [
                    "Average duration (s)",
                    analytics.totals?.averageViewDuration,
                  ],
                ].map(([k, v]) => (
                  <div className="panel stat" key={k}>
                    <small>{k}</small>
                    <strong>{Number(v || 0).toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              <section className="panel settings-section">
                <h2>Last 28 days</h2>
                <div className="analytics-chart">
                  {analytics.rows?.map((r: any, i: number) => (
                    <div
                      key={i}
                      title={`${r[0]}: ${r[1]} views`}
                      style={{
                        height: `${Math.max(2, (Number(r[1]) / Math.max(1, ...analytics.rows.map((r: any) => Number(r[1])))) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="panel">
              <Empty
                icon={ChartNoAxesCombined}
                title="Let your audience tell the next story"
                description="Connect a Google account to view real channel analytics. Add a Google Desktop OAuth client ID and secret in Connections first."
                action={
                  <Button
                    onClick={() => {
                      setCredential("googleClientId");
                      setModal("credential");
                    }}
                  >
                    <KeyRound size={15} />
                    Set up Google OAuth
                  </Button>
                }
              />
            </div>
          )}
          <div className="info-banner">
            <TvMinimal size={22} />
            <div>
              <strong>Publish with intention</strong>
              <p>
                Uploads require your review and approval. The default visibility
                is private.
              </p>
            </div>
            {active?.lastExport && (
              <Button onClick={() => setModal("publish")}>Review upload</Button>
            )}
          </div>
          <AudienceLearning
            state={state}
            projectId={active?.id}
            refresh={refresh}
            notify={notify}
          />
          {!!state.uploads.length && (
            <section className="panel settings-section">
              <h2>Upload history</h2>
              {state.uploads.map((u) => (
                <div className="run-row" key={u.id}>
                  <span>{u.title || "Video upload"}</span>
                  <Badge status={u.status}>{u.status}</Badge>
                  <small>
                    {Math.round((100 * (u.offset || 0)) / Math.max(1, u.size))}%
                    {u.publishAt
                      ? ` · Scheduled ${new Date(u.publishAt).toLocaleString()}`
                      : ""}
                  </small>
                  {["error", "uploading"].includes(u.status) && (
                    <Button
                      small
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => api(`/youtube/uploads/${u.id}/resume`, "POST"),
                          "Upload resumed",
                        )
                      }
                    >
                      Resume upload
                    </Button>
                  )}
                  {u.videoId && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={
                        "https://www.youtube.com/watch?v=" +
                        encodeURIComponent(u.videoId)
                      }
                    >
                      Open video
                    </a>
                  )}
                  {u.error && <small>{u.error}</small>}
                  {u.thumbnailError && (
                    <small>
                      Video uploaded; thumbnail needs attention:{" "}
                      {u.thumbnailError}
                    </small>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {modal === "rule" && (
        <Modal title="Add a memory rule" onClose={() => setModal("")}>
          <div className="modal-body">
            <label>
              Your preference
              <textarea
                autoFocus
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                placeholder="For example: keep every on-screen label readable on a phone."
              />
            </label>
            <label>
              Apply to
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="global">All projects</option>
                <option value="project" disabled={!active}>
                  Current project
                </option>
              </select>
            </label>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={!rule.trim() || busy}
              onClick={async () => {
                const r = await act(
                  () =>
                    api("/memory", "POST", {
                      text: rule,
                      projectId: scope === "project" ? active?.id : null,
                    }),
                  "Rule saved",
                );
                if (r) setModal("");
              }}
            >
              Save rule
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "channel" && (
        <Modal title="Add a channel" onClose={() => setModal("")}>
          <div className="modal-body">
            <label>
              Channel name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Creative direction
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Audience, tone, and what makes your channel yours…"
              />
            </label>
            <label>
              Default style
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
              >
                {state.styles.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={!name.trim() || busy}
              onClick={async () => {
                const r = await act(
                  () =>
                    api("/channels", "POST", {
                      name,
                      description,
                      style: styleId,
                    }),
                  "Channel created",
                );
                if (r) setModal("");
              }}
            >
              Add channel
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "style" && (
        <Modal title="Make a style your own" onClose={() => setModal("")}>
          <div className="modal-body">
            <label>
              Style name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Starting point
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
              >
                {state.styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Style direction
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your palette, characters, composition and motion…"
              />
            </label>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={!name.trim() || busy}
              onClick={async () => {
                const r = await act(
                  () =>
                    api("/styles", "POST", {
                      name,
                      description,
                      baseStyle: styleId,
                      look: "Custom",
                    }),
                  "Custom style saved",
                );
                if (r) setModal("");
              }}
            >
              Save style
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "credential" && (
        <Modal title="Store a credential securely" onClose={() => setModal("")}>
          <div className="modal-body">
            <label>
              Service
              <select
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              >
                {[
                  ["apiKey", "AI API key"],
                  ["elevenlabs", "ElevenLabs"],
                  ["imageKey", "Image provider"],
                  ["fish", "Fish Audio"],
                  ["googleClientId", "Google Desktop client ID"],
                  ["googleClientSecret", "Google Desktop client secret"],
                ].map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Paste credential here"
              />
            </label>
            <p className="form-hint">
              Stored with OS encryption. Leave the field empty to remove an
              existing credential.
            </p>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={busy}
              onClick={async () => {
                const r = await act(
                  () =>
                    api("/credentials", "POST", {
                      name: credential,
                      value: secret,
                    }),
                  "Credential saved securely",
                );
                if (r) {
                  setSecret("");
                  setModal("");
                }
              }}
            >
              Save credential
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "thumbnail" && (
        <Modal title="Create a thumbnail" onClose={() => setModal("")}>
          <div className="modal-body">
            <label>
              Project
              <select
                value={projectId || active?.id}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Image prompt
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe a simple, striking composition, with a clear focal point…"
              />
            </label>
            <p className="notice">
              AI image generation uses the image model, endpoint and credential
              configured in Settings and Connections.
            </p>
          </div>
          <footer>
            <Button
              disabled={busy}
              onClick={async () => {
                const r = await act(
                  () =>
                    api(`/projects/${projectId || active?.id}/jobs`, "POST", {
                      action: "thumbnail",
                    }),
                  "Frame capture queued",
                );
                if (r) setModal("");
              }}
            >
              <CameraIcon />
              Capture video frame
            </Button>
            <Button
              primary
              disabled={busy || !imagePrompt.trim()}
              onClick={async () => {
                const r = await act(
                  () =>
                    api("/thumbnails/generate", "POST", {
                      projectId: projectId || active?.id,
                      prompt: imagePrompt,
                    }),
                  "Thumbnail generated",
                );
                if (r) setModal("");
              }}
            >
              <Sparkles size={15} />
              Generate image
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "publish" && active && (
        <PublishModal
          project={active}
          act={act}
          onClose={() => setModal("")}
          busy={busy}
        />
      )}
    </div>
  );
}
function CameraIcon() {
  return <Image size={15} />;
}
function PublishModal({
  project,
  act,
  onClose,
  busy,
}: {
  project: Project;
  act: any;
  onClose: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(
      project.metadata?.titles?.[0] || project.title,
    ),
    [description, setDescription] = useState(
      project.metadata?.description || "",
    ),
    [privacy, setPrivacy] = useState("private"),
    [publishAt, setPublishAt] = useState(""),
    [kids, setKids] = useState(false),
    [synthetic, setSynthetic] = useState(true);
  return (
    <Modal title="Review & upload to YouTube" onClose={onClose}>
      <div className="modal-body">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Visibility
          <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
            <option>private</option>
            <option>unlisted</option>
            <option>public</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={kids}
            onChange={(e) => setKids(e.target.checked)}
          />
          Made for kids
        </label>
        <label>
          Schedule publishing (optional, local time)
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
          <small>Scheduled videos upload as private until this time.</small>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={synthetic}
            onChange={(e) => setSynthetic(e.target.checked)}
          />
          Contains altered or synthetic content
        </label>
        <p className="notice">
          Uploading sends your rendered video to your connected YouTube channel
          with the visibility above.
        </p>
      </div>
      <footer>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          disabled={busy || !title.trim()}
          onClick={async () => {
            const r = await act(
              () =>
                api("/youtube/upload", "POST", {
                  projectId: project.id,
                  title,
                  description,
                  privacy,
                  kids,
                  synthetic,
                  publishAt: publishAt
                    ? new Date(publishAt).toISOString()
                    : undefined,
                }),
              "Video uploaded",
            );
            if (r) onClose();
          }}
        >
          <Upload size={15} />
          {busy ? "Uploading…" : "Approve & upload"}
        </Button>
      </footer>
    </Modal>
  );
}

const routineActions = [
  ["topics", "Find a topic"],
  ["create", "Create project"],
  ["script", "Write script"],
  ["tts", "Generate voiceover"],
  ["clean", "Clean audio"],
  ["time", "Time words"],
  ["storyboard", "Write storyboard"],
  ["build", "Build video"],
  ["qa", "Quality check"],
  ["mix", "Sound design"],
  ["export", "Render video"],
  ["thumbnail", "Capture thumbnail"],
  ["metadata", "Title & description"],
  ["trailer", "Vertical trailer"],
  ["notify", "Notify me"],
  ["approval", "Approval"],
  ["upload", "Upload to YouTube"],
];
function RoutineNode({ data, selected }: NodeProps) {
  return (
    <div className={`routine-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="row">
        <div className="node-icon">
          <Workflow size={17} />
        </div>
        <div>
          <strong>{String(data.label)}</strong>
          <small>
            {String(data.action) === "approval"
              ? "Pauses for your review"
              : "Production step"}
          </small>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { step: RoutineNode };
function RoutineOptions({
  node,
  styles,
  onChange,
}: {
  node: any;
  styles: any[];
  onChange: (v: any) => void;
}) {
  if (!node) return null;
  const action = node.data.action,
    o = node.data.options || {},
    set = (key: string, value: any) => onChange({ ...o, [key]: value });
  return (
    <>
      {action === "topics" && (
        <>
          <label>
            Reference channel URLs
            <textarea
              value={o.channels || ""}
              onChange={(e) => set("channels", e.target.value)}
              placeholder="One public channel URL per line"
            />
          </label>
          <label>
            Research direction
            <textarea
              value={o.direction || ""}
              onChange={(e) => set("direction", e.target.value)}
              placeholder="Audience, angle and exclusions"
            />
          </label>
        </>
      )}
      {action === "notify" && (
        <label>
          Notification message
          <textarea
            value={o.message || ""}
            onChange={(e) => set("message", e.target.value)}
            placeholder="Your video is ready for review."
          />
        </label>
      )}
      {action === "upload" && (
        <>
          <p className="notice">
            Requires an approved Approval node before this step. Resumes an
            interrupted upload without duplicating it.
          </p>
          <label>
            Privacy
            <select
              value={o.privacy || "private"}
              onChange={(e) => set("privacy", e.target.value)}
            >
              {["private", "unlisted", "public"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!o.kids}
              onChange={(e) => set("kids", e.target.checked)}
            />{" "}
            Made for kids
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!o.synthetic}
              onChange={(e) => set("synthetic", e.target.checked)}
            />{" "}
            Contains altered or synthetic media
          </label>
        </>
      )}
      {action === "trailer" && (
        <>
          <label>
            Start (seconds)
            <input
              type="number"
              min="0"
              value={o.start || 0}
              onChange={(e) => set("start", Number(e.target.value))}
            />
          </label>
          <label>
            Duration (seconds)
            <input
              type="number"
              min="1"
              max="60"
              value={o.duration || 30}
              onChange={(e) => set("duration", Number(e.target.value))}
            />
          </label>
          <p className="form-hint">
            Creates a 1080×1920 center crop from the rendered main video. Review
            framing before posting.
          </p>
        </>
      )}
      {action === "create" && (
        <>
          <label>
            Visual style
            <select
              value={o.style || "flat"}
              onChange={(e) => set("style", e.target.value)}
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select
              value={o.format || "16:9"}
              onChange={(e) => set("format", e.target.value)}
            >
              <option>16:9</option>
              <option>9:16</option>
            </select>
          </label>
          <label>
            Language code
            <input
              value={o.language || "en"}
              onChange={(e) => set("language", e.target.value)}
            />
          </label>
          <label>
            Target duration (seconds)
            <input
              type="number"
              min="5"
              max="3600"
              value={o.targetLengthSec || 60}
              onChange={(e) => set("targetLengthSec", Number(e.target.value))}
            />
          </label>
        </>
      )}
      {action === "build" && (
        <>
          <label>
            Quality
            <select
              value={o.quality || "Standard"}
              onChange={(e) => set("quality", e.target.value)}
            >
              {["Draft", "Standard", "Detailed", "Verified", "Ultra"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Build direction
            <textarea
              value={o.direction || ""}
              onChange={(e) => set("direction", e.target.value)}
            />
          </label>
        </>
      )}
      {action === "tts" && (
        <label>
          Voice provider
          <select
            value={o.provider || "windows"}
            onChange={(e) => set("provider", e.target.value)}
          >
            <option value="windows">Windows voice</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="fish">Fish Audio</option>
            <option value="piper">Piper</option>
            <option value="kokoro">Kokoro</option>
          </select>
        </label>
      )}
      {action === "qa" && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!o.vision}
            onChange={(e) => set("vision", e.target.checked)}
          />
          Independent visual review
        </label>
      )}
      {action === "mix" && (
        <label>
          Ambience level (dB)
          <input
            type="number"
            min="-60"
            max="-6"
            value={o.level ?? -36}
            onChange={(e) => set("level", Number(e.target.value))}
          />
        </label>
      )}
      {action === "thumbnail" && (
        <label>
          Frame time (seconds)
          <input
            type="number"
            min="0"
            step=".1"
            value={o.time || 0}
            onChange={(e) => set("time", Number(e.target.value))}
          />
        </label>
      )}
      {action === "export" && (
        <>
          <label>
            Resolution
            <select
              value={o.resolution || "1080p"}
              onChange={(e) => set("resolution", e.target.value)}
            >
              {["720p", "1080p", "4K"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Frames per second
            <select
              value={o.fps || 30}
              onChange={(e) => set("fps", Number(e.target.value))}
            >
              {[24, 25, 30, 60].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}
function RoutinePage({
  state,
  refresh,
  notify,
}: {
  state: State;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [nodes, setNodes, onNodesChange] = useNodesState<any>([]),
    [edges, setEdges, onEdgesChange] = useEdgesState<any>([]),
    [name, setName] = useState("Untitled routine"),
    [topic, setTopic] = useState(""),
    [projectId, setProjectId] = useState(""),
    [nodeAction, setNodeAction] = useState("script"),
    [agent, setAgent] = useState<any>({}),
    [maxCost, setMaxCost] = useState(0),
    [topicsPerRun, setTopicsPerRun] = useState(1),
    [maxRunsPerDay, setMaxRunsPerDay] = useState(0),
    [schedule, setSchedule] = useState({ enabled: false, time: "09:00" }),
    [modal, setModal] = useState(false),
    [nodeId, setNodeId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const act = async (fn: () => Promise<any>, message?: string) => {
    try {
      const r = await fn();
      await refresh();
      if (message) notify(message);
      return r;
    } catch (e: any) {
      notify(e.message);
    }
  };
  const load = (id: string) => {
    const r = state.routines.find((r) => r.id === id);
    setSelected(id);
    setNodes(r?.nodes || []);
    setEdges(r?.edges || []);
    setName(r?.name || "Untitled routine");
    setTopic(r?.topic || "");
    setProjectId(r?.projectId || "");
    setSchedule(r?.schedule || { enabled: false, time: "09:00" });
    setAgent(r?.agent || {});
    setMaxCost(r?.maxCost || 0);
    setTopicsPerRun(r?.topicsPerRun || 1);
    setMaxRunsPerDay(r?.maxRunsPerDay || 0);
  };
  useEffect(() => {
    if (state.routines.length && !selected) load(state.routines[0].id);
  }, [state.routines.length]);
  const save = async () => {
    const r = await act(
      () =>
        api("/routines", "POST", {
          id: selected || undefined,
          name,
          topic,
          projectId,
          schedule,
          agent,
          maxCost,
          topicsPerRun,
          maxRunsPerDay,
          nodes,
          edges,
        }),
      "Routine saved",
    );
    if (r) setSelected(r.id);
    return r;
  };
  const add = () => {
    const id = crypto.randomUUID();
    setNodes((n) => [
      ...n,
      {
        id,
        type: "step",
        position: { x: 250, y: n.length * 120 + 40 },
        data: {
          action: nodeAction,
          label: routineActions.find((a) => a[0] === nodeAction)?.[1],
          options: nodeAction === "qa" ? { vision: true } : {},
        },
      },
    ]);
    if (nodes.length)
      setEdges((e) => [
        ...e,
        {
          id: crypto.randomUUID(),
          source: nodes.at(-1).id,
          target: id,
          animated: true,
        },
      ]);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              name,
              topic,
              projectId,
              schedule,
              agent,
              maxCost,
              maxRunsPerDay,
              topicsPerRun,
              nodes,
              edges,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="page routines-page">
      <PageHead
        eyebrow="FROM IDEA TO FINISHED STORY"
        title="Routines"
        description="Connect production steps. Save your process. Keep the final say."
      >
        <Button
          onClick={() => {
            load("");
            setModal(true);
          }}
        >
          <Plus size={16} />
          New routine
        </Button>
      </PageHead>
      {!state.routines.length && !nodes.length && !modal ? (
        <div className="panel">
          <Empty
            icon={Workflow}
            title="Build your creative rhythm"
            description="Create a workflow from real production steps. No demo runs or simulated results."
            action={
              <Button primary onClick={() => setModal(true)}>
                <Plus size={16} />
                Create a routine
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="routine-toolbar">
            <select value={selected} onChange={(e) => load(e.target.value)}>
              <option value="">New routine</option>
              {state.routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Routine name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="spacer" />
            <Button small onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              Import
            </Button>
            <Button small onClick={download}>
              <Download size={14} />
              JSON
            </Button>
            <Button small onClick={save}>
              <Save size={14} />
              Save
            </Button>
            <Button
              primary
              small
              disabled={!nodes.length}
              onClick={async () => {
                const r = await save();
                if (r)
                  await act(
                    () => api(`/routines/${r.id}/run`, "POST"),
                    "Routine started",
                  );
              }}
            >
              <Play size={14} />
              Run
            </Button>
          </div>
          <div className="routine-layout">
            <div className="flow-canvas">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={(c: Connection) => setEdges((e) => addEdge(c, e))}
                onNodeClick={(_, n) => setNodeId(n.id)}
                nodeTypes={nodeTypes}
                fitView
                colorMode="dark"
              >
                <Background color="#3b4641" gap={24} />
                <Controls />
                <MiniMap nodeColor="#748e80" maskColor="#11181499" />
              </ReactFlow>
              <div className="add-node">
                <select
                  value={nodeAction}
                  onChange={(e) => setNodeAction(e.target.value)}
                >
                  {routineActions.map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button small primary onClick={add}>
                  <Plus size={14} />
                  Add step
                </Button>
              </div>
            </div>
            <aside className="routine-settings">
              <h3>Routine settings</h3>
              <label>
                Existing project
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Create a new project in routine</option>
                  {state.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Topic
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What should this workflow produce?"
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(e) =>
                    setSchedule((s) => ({ ...s, enabled: e.target.checked }))
                  }
                />
                Run daily
              </label>
              {schedule.enabled && (
                <label>
                  Local time
                  <input
                    type="time"
                    value={schedule.time}
                    onChange={(e) =>
                      setSchedule((s) => ({ ...s, time: e.target.value }))
                    }
                  />
                </label>
              )}
              <p className="form-hint">
                Scheduled routines run while the app is open. Approval steps
                pause for your review.
              </p>
              <label>
                Routine provider
                <select
                  value={agent.provider || ""}
                  onChange={(e) =>
                    setAgent({
                      ...agent,
                      provider: e.target.value,
                      model: "",
                      effort: "",
                    })
                  }
                >
                  <option value="">Same as Connections</option>
                  <option value="codex">Codex</option>
                  <option value="claude">Claude</option>
                  <option value="local">Local model</option>
                  <option value="api">Compatible API</option>
                </select>
              </label>
              <ModelSelect
                provider={agent.provider || state.settings.provider || "codex"}
                value={agent.model || ""}
                onChange={(value) =>
                  setAgent((a: any) => ({ ...a, model: value }))
                }
                effort={agent.effort || ""}
                onEffortChange={(value) =>
                  setAgent((a: any) => ({ ...a, effort: value }))
                }
                label="Routine model"
              />
              <label>
                Topics per run
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={topicsPerRun}
                  onChange={(e) => setTopicsPerRun(Number(e.target.value))}
                />
              </label>
              <p className="form-hint">
                Each topic creates its own project and completes the workflow
                with its own approval. Requires Topic finder and Create project
                steps.
              </p>
              <label>
                Daily run limit (0 = unlimited)
                <input
                  type="number"
                  min="0"
                  value={maxRunsPerDay}
                  onChange={(e) => setMaxRunsPerDay(Number(e.target.value))}
                />
              </label>
              <label>
                API-equivalent budget per run, USD (0 = unlimited)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxCost}
                  onChange={(e) => setMaxCost(Number(e.target.value))}
                />
              </label>
              <p className="form-hint">
                Checked between steps. A provider call can cross the threshold.
                Unpriced calls stop the next step for review.
              </p>
              {nodeId && (
                <div className="node-settings">
                  <h3>Selected step</h3>
                  <p>{nodes.find((n) => n.id === nodeId)?.data.label}</p>
                  <RoutineOptions
                    node={nodes.find((n) => n.id === nodeId)}
                    styles={state.styles}
                    onChange={(options: any) =>
                      setNodes((ns) =>
                        ns.map((n) =>
                          n.id === nodeId
                            ? { ...n, data: { ...n.data, options } }
                            : n,
                        ),
                      )
                    }
                  />
                  <Button
                    small
                    onClick={() => {
                      setNodes((n) => n.filter((x) => x.id !== nodeId));
                      setEdges((e) =>
                        e.filter(
                          (x) => x.source !== nodeId && x.target !== nodeId,
                        ),
                      );
                      setNodeId("");
                    }}
                  >
                    <Trash2 size={13} />
                    Remove step
                  </Button>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const r = JSON.parse(await file.text());
            setNodes(r.nodes || []);
            setEdges(r.edges || []);
            setName(r.name || "Imported routine");
            setTopic(r.topic || "");
            setAgent(r.agent || {});
            setProjectId(state.projects.some((p) => p.id === r.projectId) ? r.projectId : "");
            setSchedule(r.schedule || { enabled: false, time: "09:00" });
            setMaxCost(Number(r.maxCost) || 0);
            setMaxRunsPerDay(Number(r.maxRunsPerDay) || 0);
            setTopicsPerRun(Math.max(1, Math.min(10, Number(r.topicsPerRun) || 1)));
            setSelected("");
          } catch {
            notify("Invalid routine JSON");
          }
          e.target.value = "";
        }}
      />
      {state.jobs.filter((j) => j.action === "routine").length > 0 && (
        <section className="panel routine-runs">
          <div className="section-head">
            <h2>Run history</h2>
          </div>
          {state.jobs
            .filter((j) => j.action === "routine")
            .map((j) => (
              <div className="run-row" key={j.id}>
                <Clock size={16} />
                <span>{new Date(j.createdAt).toLocaleString()}</span>
                <Badge status={j.status}>{j.status}</Badge>
                <small>{j.events.at(-1)?.text}</small>
                {j.error?.includes("Waiting for your approval") ? (
                  <Button
                    small
                    onClick={() =>
                      act(() => api(`/jobs/${j.id}/approve`, "POST"))
                    }
                  >
                    Approve & continue
                  </Button>
                ) : ["error", "paused", "stopped"].includes(j.status) ? (
                  <Button
                    small
                    onClick={() =>
                      act(() => api(`/jobs/${j.id}/retry`, "POST"))
                    }
                  >
                    Retry
                  </Button>
                ) : j.status === "running" ? (
                  <Button
                    small
                    onClick={() => act(() => api(`/jobs/${j.id}/stop`, "POST"))}
                  >
                    Stop
                  </Button>
                ) : null}
              </div>
            ))}
        </section>
      )}
      {modal && (
        <Modal title="Create a routine" onClose={() => setModal(false)}>
          <div className="modal-body">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="form-hint">
              Start with a blank canvas and add the production steps you need.
            </p>
          </div>
          <footer>
            <Button onClick={() => setModal(false)}>Cancel</Button>
            <Button
              primary
              onClick={async () => {
                const r = await save();
                if (r) setModal(false);
              }}
            >
              Create routine
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home,
  PanelsTopLeft,
  TvMinimal,
  Clapperboard,
  SlidersHorizontal,
  Brain,
  Image,
  Workflow,
  Film,
  ChartNoAxesCombined,
  Plus,
  Search,
  Settings,
  Plug,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Upload,
  PanelLeftClose,
  Sparkles,
  Check,
  X,
  FolderOpen,
  Trash2,
  Copy,
  Download,
  MoreHorizontal,
  Clock,
  Command,
  ChevronRight,
  Monitor,
} from "lucide-react";
import {
  api,
  emptyState,
  ago,
  time,
  media,
  type Project,
  type State,
} from "./types";
import { Button, Modal, PageHead, Empty, Badge, StyleArt } from "./ui";
import Editor from "./Editor";
import { WorkspacePages } from "./Pages";
const nav = [
  ["Home", Home],
  ["Projects", PanelsTopLeft],
  ["Channels", TvMinimal],
  ["Editor", Clapperboard],
  ["WORKSPACE", null],
  ["Styles", SlidersHorizontal],
  ["Memory", Brain],
  ["Thumbnails", Image],
  ["Routines", Workflow],
  ["Renders", Film],
  ["ANALYTICS", null],
  ["YouTube", ChartNoAxesCombined],
] as const;
export default function App() {
  const [state, setState] = useState<State>(emptyState),
    [page, setPage] = useState(localStorage.getItem("page") || "Home"),
    [activeId, setActiveId] = useState(
      localStorage.getItem("activeProject") || "",
    ),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [channel, setChannel] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [loading, setLoading] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      setState(await api("/state"));
      setLoading(false);
    } catch (e: any) {
      notify(e.message);
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1800);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    localStorage.setItem("page", page);
    setSearch("");
  }, [page]);
  useEffect(() => {
    localStorage.setItem("activeProject", activeId);
  }, [activeId]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setModal((m) => (m === "search" ? "" : "search"));
      }
      if (e.key === "Escape") setModal("");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const active =
    state.projects.find((p) => p.id === activeId) || state.projects[0];
  const open = (p: Project) => {
    setActiveId(p.id);
    setPage("Editor");
  };
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
  const doImport = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const p = await act(() => api("/import", "POST", form), "Project imported");
    if (p) open(p);
  };
  const last = state.projects[0];
  const running = state.jobs.filter((j) =>
    ["running", "queued"].includes(j.status),
  );
  const visible = state.projects.filter(
    (p) =>
      (filter === "All" || p.status === filter.toLowerCase()) &&
      (!channel || p.channelId === channel) &&
      p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className={`app ${collapsed || page === "Editor" ? "compact" : ""}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("Home")}>
          <div className="brandmark">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-text">
            <strong>
              framecraft<span>STUDIO</span>
            </strong>
            <small>
              <i /> Local workspace
            </small>
          </div>
        </button>
        <div className="workspace-switch">
          <span>Faceless Brand</span>
          <ChevronDown size={14} />
        </div>
        <button className="search-launch" onClick={() => setModal("search")}>
          <Search size={16} />
          <span>Search or jump to…</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav>
          {nav.map(([name, Icon]) =>
            Icon ? (
              <button
                key={name}
                title={name}
                onClick={() => setPage(name)}
                className={`nav-item ${page === name ? "active" : ""}`}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span>{name}</span>
                {name === "Projects" && <small>{state.projects.length}</small>}
                {name === "Editor" && running.length > 0 && (
                  <i className="running-dot" />
                )}
              </button>
            ) : (
              <div key={name} className="nav-label">
                {name}
              </div>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "Connections" ? "active" : ""}`}
            onClick={() => setPage("Connections")}
            title="Connections"
          >
            <Plug size={18} />
            <span>Connections</span>
          </button>
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => setPage("Settings")}
            title="Settings"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button
            className="new-sidebar"
            onClick={() => setModal("new")}
            title="New project"
          >
            <Plus size={18} />
            <span>New project</span>
            <kbd>＋</kbd>
          </button>
          <div className="sidebar-footer">
            <span>
              <i /> On your machine
            </span>
            <button
              className="icon-button"
              title="Collapse sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className={page === "Editor" ? "editor-main" : "main"}>
        {page === "Home" && (
          <div className="page home">
            <div className="home-top">
              <span className="breadcrumb">
                Workspace <ChevronRight size={13} /> Overview
              </span>
              <span className="local-chip">
                <i /> All files saved locally
              </span>
            </div>
            <PageHead
              title="Make something worth watching."
              description="Your ideas, brought to life. Everything you need to tell your next story."
            >
              <Button onClick={() => importRef.current?.click()}>
                <Upload size={16} />
                Import
              </Button>
              <Button primary onClick={() => setModal("new")}>
                <Plus size={16} />
                New project
              </Button>
            </PageHead>
            <div className="quick-grid">
              {[
                {
                  title: last ? "Continue editing" : "Your next story",
                  sub: last ? last.title : "A blank canvas for a great idea",
                  icon: Clapperboard,
                  click: () => (last ? open(last) : setModal("new")),
                },
                {
                  title: "New project",
                  sub: "From an idea to a finished video",
                  icon: Plus,
                  click: () => setModal("new"),
                },
                {
                  title: "Find your style",
                  sub: "Five distinct ways to tell a story",
                  icon: SlidersHorizontal,
                  click: () => setPage("Styles"),
                },
                {
                  title: "Creative memory",
                  sub: "Your preferences, remembered",
                  icon: Brain,
                  click: () => setPage("Memory"),
                },
              ].map((q, i) => (
                <button
                  className={`quick-card q${i}`}
                  key={q.title}
                  onClick={q.click}
                >
                  <div className="quick-top">
                    <div className="quick-icon">
                      <q.icon size={21} strokeWidth={1.5} />
                    </div>
                    <ArrowUpRight size={17} />
                  </div>
                  <strong>{q.title}</strong>
                  <p>{q.sub}</p>
                </button>
              ))}
            </div>
            <div className="home-columns">
              <section className="panel recent-projects">
                <div className="section-head">
                  <h2>
                    Recent projects <span>{state.projects.length}</span>
                  </h2>
                  <button onClick={() => setPage("Projects")}>
                    View all <ArrowRight size={14} />
                  </button>
                </div>
                {!last ? (
                  <Empty
                    title="Room for your first great idea"
                    description="Create a project, add your story, and make it yours."
                    action={
                      <Button small onClick={() => setModal("new")}>
                        <Plus size={14} />
                        Create your first project
                      </Button>
                    }
                  />
                ) : (
                  state.projects.slice(0, 5).map((p) => (
                    <button
                      className="recent-row"
                      key={p.id}
                      onClick={() => open(p)}
                    >
                      <div className="mini-thumb">
                        {p.thumbnail ? (
                          <img src={media(p, p.thumbnail)} />
                        ) : (
                          <Clapperboard size={20} />
                        )}
                      </div>
                      <div>
                        <strong>{p.title}</strong>
                        <p>
                          {p.shots.length} shots ·{" "}
                          {state.styles.find((s) => s.id === p.style)?.name}
                        </p>
                      </div>
                      <span>{ago(p.updatedAt)}</span>
                      <ChevronRight size={15} />
                    </button>
                  ))
                )}
              </section>
              <section className="panel activity">
                <div className="section-head">
                  <h2>Studio activity</h2>
                  <span className="subtle">
                    {state.jobs.filter((j) => j.status === "done").length}{" "}
                    completed
                  </span>
                </div>
                {!state.jobs.length ? (
                  <Empty
                    icon={Sparkles}
                    title="A little quiet. For now."
                    description="Builds, edits and exports will appear here as your stories take shape."
                  />
                ) : (
                  <div className="activity-list">
                    {state.jobs.slice(0, 7).map((j) => (
                      <button
                        className="activity-row"
                        key={j.id}
                        onClick={() => {
                          const p = state.projects.find(
                            (p) => p.id === j.projectId,
                          );
                          if (p) open(p);
                          else setPage("Connections");
                        }}
                      >
                        <div className="activity-icon">
                          <Sparkles size={15} />
                        </div>
                        <div>
                          <strong>
                            {j.action.charAt(0).toUpperCase() +
                              j.action.slice(1)}{" "}
                            {j.status === "done" ? "completed" : j.status}
                          </strong>
                          <p>
                            {state.projects.find((p) => p.id === j.projectId)
                              ?.title || "Connection test"}
                          </p>
                        </div>
                        <Badge status={j.status}>{j.status}</Badge>
                        <small>{ago(j.createdAt)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="home-bottom">
              <div>
                <span className="tiny-label">MADE FOR YOUR CREATIVE FLOW</span>
                <h3>One story. Infinite possibilities.</h3>
                <p>
                  Choose a look, bring your voice, and let your imagination
                  lead.
                </p>
                <button className="text-link" onClick={() => setPage("Styles")}>
                  Explore the style library <ArrowRight size={15} />
                </button>
              </div>
              <div className="style-mini-strip">
                {["paint", "flat", "pixel", "collage", "3d"].map((s) => (
                  <StyleArt key={s} style={s} />
                ))}
              </div>
            </div>
            <footer className="page-footer">
              <span>
                <Monitor size={14} /> Local rendering. Your files. Your creative
                control.
              </span>
              <span>
                FRAMECRAFT STUDIO <i>01</i>
              </span>
            </footer>
          </div>
        )}
        {page === "Projects" && (
          <div className="page">
            <PageHead
              eyebrow="YOUR WORKSPACE"
              title="Projects"
              description="Every story starts here. Pick up where you left off."
            >
              <Button onClick={() => importRef.current?.click()}>
                <Upload size={16} />
                Import ZIP
              </Button>
              <Button primary onClick={() => setModal("new")}>
                <Plus size={16} />
                New project
              </Button>
            </PageHead>
            <div className="filter-bar">
              <div className="tabs">
                {["All", "Draft", "Editing", "Ready"].map((f) => (
                  <button
                    className={filter === f ? "selected" : ""}
                    key={f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                    {f === "All" && <small>{state.projects.length}</small>}
                  </button>
                ))}
              </div>
              <div className="row">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    placeholder="Search projects…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="">All channels</option>
                  {state.channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {visible.length ? (
              <div className="project-grid">
                {visible.map((p) => (
                  <article className="project-card" key={p.id}>
                    <button className="project-cover" onClick={() => open(p)}>
                      {p.thumbnail ? (
                        <img src={media(p, p.thumbnail)} />
                      ) : (
                        <div className="no-scenes">
                          <Clapperboard size={28} strokeWidth={1} />
                          <span>
                            {p.shots.length
                              ? `${p.shots.length} scenes built`
                              : "No scenes yet"}
                          </span>
                        </div>
                      )}
                      <span className="duration">
                        {time(p.durationSec || p.targetLengthSec)}
                      </span>
                    </button>
                    <div className="project-info">
                      <div className="row spread">
                        <h3>
                          <button onClick={() => open(p)}>{p.title}</button>
                        </h3>
                        <Badge status={p.status}>{p.status}</Badge>
                      </div>
                      <p>
                        {p.shots.length} shots ·{" "}
                        {state.styles.find((s) => s.id === p.style)?.name}
                      </p>
                      <div className="project-foot">
                        <small>{ago(p.updatedAt)}</small>
                        <div className="row">
                          <button
                            title="Open folder"
                            onClick={() =>
                              act(() =>
                                api("/open-folder", "POST", {
                                  projectId: p.id,
                                }),
                              )
                            }
                          >
                            <FolderOpen size={15} />
                          </button>
                          <button
                            title="Duplicate project"
                            onClick={() =>
                              act(
                                () =>
                                  api(`/projects/${p.id}/duplicate`, "POST"),
                                "Project duplicated",
                              )
                            }
                          >
                            <Copy size={15} />
                          </button>
                          <a
                            title="Export ZIP"
                            href={`/api/projects/${p.id}/zip`}
                          >
                            <Download size={15} />
                          </a>
                          <button
                            title="Delete project"
                            onClick={() => {
                              setActiveId(p.id);
                              setModal("delete");
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel">
                <Empty
                  title={
                    search || filter !== "All"
                      ? "No matching projects"
                      : "Your stories belong here"
                  }
                  description="No example projects. Just a clean workspace, ready for your ideas."
                  action={
                    <Button primary onClick={() => setModal("new")}>
                      <Plus size={16} />
                      Create a project
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        )}
        {page === "Editor" &&
          (active ? (
            <Editor
              key={active.id}
              project={active}
              state={state}
              refresh={refresh}
              notify={notify}
              go={setPage}
            />
          ) : (
            <div className="page">
              <PageHead
                title="The editing room"
                description="A place to bring every frame into focus."
              />
              <div className="panel">
                <Empty
                  icon={Clapperboard}
                  title="Start with your story"
                  description="Create a project to open the timeline, narration and AI editing tools."
                  action={
                    <Button primary onClick={() => setModal("new")}>
                      <Plus size={16} />
                      New project
                    </Button>
                  }
                />
              </div>
            </div>
          ))}
        {!["Home", "Projects", "Editor"].includes(page) && (
          <WorkspacePages
            page={page}
            state={state}
            active={active}
            refresh={refresh}
            notify={notify}
            go={setPage}
            open={open}
          />
        )}
      </main>
      <input
        hidden
        ref={importRef}
        type="file"
        accept=".zip"
        onChange={(e) => {
          doImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {modal === "new" && (
        <NewProject
          state={state}
          onClose={() => setModal("")}
          onCreate={async (data) => {
            const p = await api("/projects", "POST", data);
            await refresh();
            open(p);
            setModal("");
            notify("Project created. Saved on your machine.");
            if (data.topic && !data.script) {
              await api(`/projects/${p.id}/jobs`, "POST", { action: "script" });
              refresh();
            }
          }}
          notify={notify}
        />
      )}
      {modal === "delete" && active && (
        <Modal title="Delete project?" onClose={() => setModal("")}>
          <div className="modal-body">
            <p>
              “{active.title}” will be moved to the workspace trash folder. Its
              files remain recoverable.
            </p>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              onClick={async () => {
                await act(
                  () => api(`/projects/${active.id}`, "DELETE"),
                  "Project moved to trash",
                );
                setModal("");
              }}
            >
              Delete project
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "search" && (
        <Modal title="Jump to anything" onClose={() => setModal("")}>
          <div className="modal-body command-palette">
            <div className="search-field">
              <Search size={18} />
              <input
                autoFocus
                placeholder="Search pages and projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {[
              ...nav
                .filter((n) => n[1])
                .map(([name]) => ({ name, action: () => setPage(name) })),
              { name: "Connections", action: () => setPage("Connections") },
              { name: "New project", action: () => setModal("new") },
              ...state.projects.map((p) => ({
                name: p.title,
                action: () => open(p),
              })),
            ]
              .filter((i) =>
                i.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((i) => (
                <button
                  key={i.name}
                  onClick={() => {
                    setModal("");
                    i.action();
                  }}
                >
                  {i.name}
                  <ArrowUpRight size={15} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {loading && <div className="loading-line" />}
    </div>
  );
}

function NewProject({
  state,
  onClose,
  onCreate,
  notify,
}: {
  state: State;
  onClose: () => void;
  onCreate: (d: any) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState({
      title: "",
      channelId: "",
      style: "flat",
      look: "Bold & bright",
      targetLengthSec: 60,
      format: "16:9",
      language: "en",
      topic: "",
      script: "",
      direction: "",
    }),
    [mode, setMode] = useState("topic"),
    [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const submit = async () => {
    if (!data.title.trim()) return notify("Give your video a title");
    setBusy(true);
    try {
      await onCreate({
        ...data,
        topic: mode === "topic" ? data.topic : "",
        script: mode === "script" ? data.script : "",
      });
    } catch (e: any) {
      notify(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="New project" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === "Enter") submit();
        }}
      >
        <div className="modal-body new-project-body">
          <div className="form-section">
            <div className="section-number">
              01 <strong>The video</strong>
            </div>
            <input
              autoFocus
              className="title-input"
              placeholder="Give your story a name"
              value={data.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={180}
            />
            <label>
              Channel
              <select
                value={data.channelId}
                onChange={(e) => set("channelId", e.target.value)}
              >
                <option value="">No channel</option>
                {state.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-hint">
              You can add or generate a voiceover in the editor.
            </p>
          </div>
          <div className="form-section">
            <div className="section-number">
              02 <strong>The look</strong>
            </div>
            <div className="form-grid">
              <label>
                Visual style
                <select
                  value={data.style}
                  onChange={(e) => {
                    set("style", e.target.value);
                    set(
                      "look",
                      state.styles.find((s) => s.id === e.target.value)?.look,
                    );
                  }}
                >
                  {state.styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Look
                <input
                  value={data.look}
                  onChange={(e) => set("look", e.target.value)}
                />
              </label>
              <label>
                Target length
                <select
                  value={data.targetLengthSec}
                  onChange={(e) =>
                    set("targetLengthSec", Number(e.target.value))
                  }
                >
                  {[30, 60, 180, 300, 600, 900, 1200].map((n) => (
                    <option key={n} value={n}>
                      {time(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Format
                <select
                  value={data.format}
                  onChange={(e) => set("format", e.target.value)}
                >
                  <option>16:9</option>
                  <option>9:16</option>
                </select>
              </label>
              <label>
                Language
                <select
                  value={data.language}
                  onChange={(e) => set("language", e.target.value)}
                >
                  {Object.entries({
                    en: "English",
                    hi: "Hindi",
                    es: "Spanish",
                    fr: "French",
                    de: "German",
                    pt: "Portuguese",
                    ja: "Japanese",
                    ko: "Korean",
                    zh: "Chinese",
                    ar: "Arabic",
                    it: "Italian",
                    ru: "Russian",
                    nl: "Dutch",
                    tr: "Turkish",
                    id: "Indonesian",
                    vi: "Vietnamese",
                    th: "Thai",
                    pl: "Polish",
                    sv: "Swedish",
                    da: "Danish",
                    fi: "Finnish",
                    no: "Norwegian",
                    uk: "Ukrainian",
                    bn: "Bengali",
                    ta: "Tamil",
                    te: "Telugu",
                  }).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="form-section">
            <div className="section-number">
              03 <strong>The story</strong>
              <span>optional</span>
            </div>
            <div className="tabs inset">
              <button
                type="button"
                className={mode === "topic" ? "selected" : ""}
                onClick={() => setMode("topic")}
              >
                <Sparkles size={14} />
                AI writes it
              </button>
              <button
                type="button"
                className={mode === "script" ? "selected" : ""}
                onClick={() => setMode("script")}
              >
                I have a script
              </button>
            </div>
            {mode === "topic" ? (
              <label>
                What is your video about?
                <textarea
                  placeholder="A topic, a question, a story waiting to be told…"
                  value={data.topic}
                  onChange={(e) => set("topic", e.target.value)}
                />
              </label>
            ) : (
              <label>
                Your narration
                <textarea
                  className="script-input"
                  placeholder="Paste your script here. Use ## for chapter headings."
                  value={data.script}
                  onChange={(e) => set("script", e.target.value)}
                />
              </label>
            )}
            <label>
              Creative direction <span>optional</span>
              <textarea
                placeholder="Tone, audience, details to focus on…"
                value={data.direction}
                onChange={(e) => set("direction", e.target.value)}
              />
            </label>
          </div>
        </div>
        <footer>
          <small>Ctrl + Enter to create</small>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" primary disabled={busy || !data.title.trim()}>
            {busy ? "Creating…" : "Create project"}
            <ArrowRight size={15} />
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

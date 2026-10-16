import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Camera,
  Download,
  FolderOpen,
  FileText,
  Keyboard,
  Sparkles,
  Check,
  Clock,
  Plus,
  ArrowUp,
  Square,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  History,
  Undo2,
  Code,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Clapperboard,
  AudioLines,
  Music,
  Type,
  Anchor,
  Mic,
  Upload,
  ShieldCheck,
  StickyNote,
  X,
  LoaderCircle,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";
import { api, media, time, ago, type Project, type State } from "./types";
import { Button, Modal, Badge, Busy, Empty } from "./ui";
import Assets from "./Assets";
import { ProjectModelPicker, providerNames } from "./ModelSelect";
import { TimelineEditor } from "./TimelineEditor";
import { SilenceTrimmer } from "./SilenceTrimmer";
import { ReferencePicker } from "./ReferencePicker";
import { ScriptSettings, type ScriptSettingsHandle } from "./ScriptSettings";
import { qualityLevels, qualityDescriptions } from "../public/lib/quality.js";
import { StyleParameters } from "./StyleParameters";
import { CharacterBuilder } from "./CharacterBuilder";
import { RetakeEditor } from "./RetakeEditor";
import { resolveAgentRoute, capabilityFor } from "../server/agent-routing.mjs";
const stageInfo = [
  ["script", "Script written", FileText, "Open"],
  ["voiceover", "Voiceover added", AudioLines, "Add"],
  ["audioCleaned", "Audio cleaned", Sparkles, "Run"],
  ["wordsTimed", "Words timed", Clock, "Run"],
  ["storyboard", "Storyboard written", Clapperboard, "Plan"],
  ["scenes", "Scenes built", Clapperboard, "Build"],
  ["soundDesign", "Sound design mixed", Music, "Mix"],
  ["exported", "Video exported", FilmIcon, "Export"],
] as const;
function FilmIcon(props: any) {
  return <Clapperboard {...props} />;
}
export default function Editor({
  project: p,
  state,
  refresh,
  notify,
  go,
}: {
  project: Project;
  state: State;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  go: (s: string) => void;
}) {
  const [modal, setModal] = useState(""),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(false),
    [loop, setLoop] = useState(false),
    [speed, setSpeed] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [scope, setScope] = useState("shot"),
    [range, setRange] = useState<{ start: number; end: number } | null>(null),
    [comparison, setComparison] = useState<any[]>([]),
    [prompt, setPrompt] = useState(""),
    [tab, setTab] = useState("Chat"),
    [scriptTab, setScriptTab] = useState("Narration"),
    [script, setScript] = useState(p.script),
    [research, setResearch] = useState(p.research),
    [direction, setDirection] = useState(""),
    [quality, setQuality] = useState(0),
    [voiceProvider, setVoiceProvider] = useState("windows"),
    [voice, setVoice] = useState(""),
    [voices, setVoices] = useState<string[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [diff, setDiff] = useState(""),
    [zoom, setZoom] = useState(1),
    [resolution, setResolution] = useState("1080p"),
    [fps, setFps] = useState(30),
    [busy, setBusy] = useState(false),
    [wave, setWave] = useState<number[]>([]),
    [notes, setNotes] = useState(false),
    [note, setNote] = useState("");
  const player = useRef<HTMLIFrameElement>(null),
    scriptSettings = useRef<ScriptSettingsHandle>(null),
    audio = useRef<HTMLAudioElement>(null),
    audioFile = useRef<HTMLInputElement>(null),
    cameraFile = useRef<HTMLInputElement>(null),
    wordsFile = useRef<HTMLInputElement>(null),
    last = useRef(0),
    posRef = useRef(0),
    rangeAnchor = useRef<number | null>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    logs = useRef<HTMLDivElement>(null);
  const duration = p.durationSec || p.shots.at(-1)?.end || 0;
  const shot =
    p.shots.find((s) => position >= s.start && position < s.end) ||
    p.shots.at(-1);
  const jobs = state.jobs.filter((j) => j.projectId === p.id),
    running = jobs.find((j) => ["running", "queued"].includes(j.status)),
    current = jobs[0];
  const provider =
    providerNames[
      running?.provider || p.agent?.provider || state.settings.provider
    ] || "AI assistant";
  const displayRoute = running?.provider
    ? { provider: running.provider, model: running.model || "" }
    : resolveAgentRoute(state.settings, "build", p.agent);
  const capability = capabilityFor(
    state.settings,
    displayRoute,
    state.settings.calibrations || [],
  );
  const post = (data: any) =>
    player.current?.contentWindow?.postMessage(data, location.origin);
  const seek = (t: number) => {
    const n = Math.max(0, Math.min(duration, t));
    posRef.current = n;
    setPosition(n);
    if (audio.current && Math.abs(audio.current.currentTime - n) > 0.1)
      audio.current.currentTime = n;
    post({ type: "time", time: n });
  };
  const act = async (fn: () => Promise<any>, msg?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      await refresh();
      if (msg) notify(msg);
      return r;
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const job = async (action: string, options: any = {}) => {
    const r = await act(() =>
      api(`/projects/${p.id}/jobs`, "POST", { action, options }),
    );
    if (r) {
      setModal("");
      setTab("Chat");
    }
    return r;
  };
  useEffect(() => {
    const element = timelineScroll.current;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((v) =>
        Math.max(1, Math.min(16, v * (event.deltaY < 0 ? 1.25 : 0.8))),
      );
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== player.current?.contentWindow
      )
        return;
      if (e.data.type === "ready") {
        post({ type: "project", project: p });
        post({ type: "time", time: posRef.current });
      }
      if (e.data.type === "selection") {
        setSelected(e.data.id);
        setScope(e.data.id ? "selection" : "shot");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [p.updatedAt]);
  useEffect(() => {
    post({ type: "project", project: p });
  }, [p.updatedAt]);
  useEffect(() => {
    if (modal === "script") {
      setScript(p.script);
      setResearch(p.research);
    }
    if (modal === "audio")
      api("/hardware")
        .then((h) => setVoices(h.voices))
        .catch(() => {});
  }, [modal]);
  useEffect(() => {
    if (tab === "History")
      api(`/projects/${p.id}/history`)
        .then(setHistory)
        .catch((e) => notify(e.message));
  }, [tab, current?.status, p.updatedAt]);
  useEffect(() => {
    if (logs.current) logs.current.scrollTop = logs.current.scrollHeight;
  }, [current?.events.length]);
  useEffect(() => {
    if (!p.audio) {
      setWave([]);
      return;
    }
    let cancelled = false;
    const context = new AudioContext();
    fetch(media(p, p.audio)!)
      .then((r) => r.arrayBuffer())
      .then((b) => context.decodeAudioData(b))
      .then((b) => {
        const samples = b.getChannelData(0),
          step = Math.max(1, Math.floor(samples.length / 220)),
          out = [];
        for (let i = 0; i < 220; i++) {
          let max = 0;
          for (
            let j = i * step;
            j < Math.min(samples.length, (i + 1) * step);
            j += 20
          )
            max = Math.max(max, Math.abs(samples[j]));
          out.push(max);
        }
        if (!cancelled) setWave(out);
      })
      .catch(() => {})
      .finally(() => context.close());
    return () => {
      cancelled = true;
    };
  }, [p.audio, p.durationSec]);
  useEffect(() => {
    if (audio.current) {
      audio.current.playbackRate = speed;
      audio.current.muted = muted;
    }
    if (playing && audio.current && p.audio)
      audio.current.play().catch((e) => {
        notify(e.message);
        setPlaying(false);
      });
    else audio.current?.pause();
    if (!playing) return;
    let id: number;
    last.current = performance.now();
    const tick = (now: number) => {
      let n =
        p.audio && audio.current
          ? audio.current.currentTime
          : posRef.current + ((now - last.current) / 1000) * speed;
      last.current = now;
      if (n >= duration) {
        if (loop) {
          n = 0;
          if (audio.current) audio.current.currentTime = 0;
        } else {
          setPlaying(false);
          n = duration;
        }
      }
      posRef.current = n;
      setPosition(n);
      post({ type: "time", time: n });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, muted, loop, p.audio, duration]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        if (duration) setPlaying((v) => !v);
      }
      if (e.key === "ArrowRight") seek(posRef.current + 1);
      if (e.key === "ArrowLeft") seek(posRef.current - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [duration]);
  const stageClick = (s: string) => {
    if (s === "script") setModal("script");
    else if (s === "voiceover") setModal("audio");
    else if (s === "scenes") setModal("build");
    else if (s === "exported") setModal("export");
    else if (s === "soundDesign") job("mix");
    else
      job(
        (
          {
            audioCleaned: "clean",
            wordsTimed: "time",
            storyboard: "storyboard",
          } as any
        )[s],
      );
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await act(() =>
      api(`/projects/${p.id}`, "PATCH", {
        notes: [
          ...p.notes,
          {
            id: crypto.randomUUID(),
            time: position,
            shotId: shot?.id,
            elementId: selected,
            text: note,
          },
        ],
      }),
    );
    setNote("");
  };
  return (
    <div className="editor">
      <header className="editor-header">
        <div>
          <h2>{p.title}</h2>
          <span className="subtle">
            <Check size={11} /> Saved locally · Git history
          </span>
        </div>
        <div className="row">
          <Badge>
            {state.styles.find((s) => s.id === p.style)?.name} · {p.look}
          </Badge>
          <button
            className="icon-button"
            title="Open script"
            onClick={() => setModal("script")}
          >
            <FileText size={17} />
          </button>
          <button
            className="icon-button"
            title="Keyboard shortcuts"
            onClick={() => setModal("shortcuts")}
          >
            <Keyboard size={17} />
          </button>
          <button
            className="icon-button"
            title="Open project folder"
            onClick={() =>
              act(() => api("/open-folder", "POST", { projectId: p.id }))
            }
          >
            <FolderOpen size={18} />
          </button>
          <Button small onClick={() => setModal("assets")}>
            Assets
          </Button>
          <Button small onClick={() => setModal("references")}>
            Pick parts
          </Button>
          <Button
            small
            disabled={!!running}
            onClick={() => setModal("style-parameters")}
          >
            <SlidersHorizontal size={14} />
            Style
          </Button>
          <button
            className="icon-button"
            title="Build a rigged character"
            onClick={() => setModal("character")}
          >
            <Sparkles size={16} />
          </button>
          <Button primary small onClick={() => setModal("export")}>
            <Download size={15} />
            Export
          </Button>
        </div>
      </header>
      <div className="editor-body">
        <aside className="shots-panel">
          <div className="section-head">
            <span className="tiny-label">
              SHOTS <span>{p.shots.length}</span>
            </span>
            <button title="Build scenes" onClick={() => setModal("build")}>
              <Plus size={15} />
            </button>
          </div>
          {p.shots.length ? (
            <div className="shot-list">
              {p.shots.map((s, i) => (
                <button
                  className={`shot-row ${shot?.id === s.id ? "active" : ""}`}
                  key={s.id}
                  onClick={() => {
                    seek(s.start);
                    setSelected(null);
                    setScope("shot");
                  }}
                >
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  <div
                    className="shot-thumb"
                    style={{ background: s.scene?.background || "#171b1a" }}
                  >
                    {s.status === "built" ? (
                      <Check size={17} />
                    ) : (
                      <Clock size={17} />
                    )}
                  </div>
                  <div>
                    <strong>{s.title}</strong>
                    <small>
                      {time(s.start)} · {(s.end - s.start).toFixed(1)}s
                    </small>
                    <code>{s.id}.js</code>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="shot-hint">
              Every great video starts with a story. Work through the pipeline
              below.
            </p>
          )}
          <div className="pipeline">
            <div className="tiny-label">PRODUCTION PIPELINE</div>
            {stageInfo.map(([s, label, Icon, action]) => (
              <div className="pipeline-stage" key={s}>
                <span className={`stage-icon ${p.pipeline[s]}`}>
                  {p.pipeline[s] === "done" ? (
                    <Check size={12} />
                  ) : (
                    <Icon size={12} />
                  )}
                </span>
                <span>{label}</span>
                <button onClick={() => stageClick(s)}>
                  {p.pipeline[s] === "done" && action === "Run"
                    ? "Redo"
                    : action}
                </button>
              </div>
            ))}
            <Button
              small
              onClick={() => job("qa")}
              disabled={!p.shots.some((s) => s.scene)}
            >
              <ShieldCheck size={14} />
              Check frames
            </Button>
          </div>
        </aside>
        <section className="editing-stage">
          <div className="preview-wrap">
            <div className={`preview ${p.format === "9:16" ? "vertical" : ""}`}>
              <iframe
                title="Video preview"
                ref={player}
                src="/player.html"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            {!p.shots.length && (
              <div className="preview-tag">
                <span>PREVIEW</span> YOUR CREATIVE SPACE
              </div>
            )}
          </div>
          <div className="transport">
            <div className="row">
              <button
                title="Previous shot"
                onClick={() =>
                  seek(
                    p.shots[
                      Math.max(
                        0,
                        p.shots.findIndex((s) => s.id === shot?.id) - 1,
                      )
                    ]?.start || 0,
                  )
                }
              >
                <SkipBack size={17} />
              </button>
              <button
                className="play-button"
                title={playing ? "Pause" : "Play"}
                onClick={() =>
                  duration
                    ? setPlaying(!playing)
                    : notify(
                        "Add narration and build scenes to preview your video",
                      )
                }
              >
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                title="Next shot"
                onClick={() =>
                  seek(
                    p.shots[
                      Math.min(
                        p.shots.length - 1,
                        p.shots.findIndex((s) => s.id === shot?.id) + 1,
                      )
                    ]?.start || 0,
                  )
                }
              >
                <SkipForward size={17} />
              </button>
              <span className="timecode">
                {time(position)}
                <small>
                  .{String(Math.floor((position % 1) * 100)).padStart(2, "0")}
                </small>
                <span> / {time(duration)}</span>
              </span>
            </div>
            <span className="current-shot">
              {shot ? `${shot.id} · ${shot.title}` : "No shot selected"}
            </span>
            <div className="row">
              <button
                title="Save frame as thumbnail"
                onClick={() => job("thumbnail", { time: position })}
              >
                <Camera size={16} />
              </button>
              <button
                title={muted ? "Unmute" : "Mute"}
                onClick={() => setMuted(!muted)}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                title="Loop video"
                className={loop ? "mint" : ""}
                onClick={() => setLoop(!loop)}
              >
                <Repeat size={16} />
              </button>
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {[0.5, 1, 1.5, 2].map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="timeline">
            <div className="timeline-toolbar">
              <span>Timeline</span>
              <small>Click to seek · Shift-drag to select shots</small>
              <div className="row">
                <button
                  title="Edit timeline tracks"
                  onClick={() => setModal("timeline")}
                >
                  <SlidersHorizontal size={15} /> Edit tracks
                </button>
                {p.audio && (
                  <button
                    title="Review repeated takes"
                    disabled={!!running || !p.words.length}
                    onClick={() => setModal("takes")}
                  >
                    <Scissors size={15} /> Review takes
                  </button>
                )}
                {p.audio && (
                  <button
                    title="Trim pauses"
                    disabled={!!running}
                    onClick={() => setModal("trim")}
                  >
                    <Scissors size={15} /> Trim pauses
                  </button>
                )}
                {range && (
                  <button
                    title="Clear selected range"
                    onClick={() => {
                      setRange(null);
                      if (scope === "range") setScope("shot");
                    }}
                  >
                    {time(range.start)}–{time(range.end)} <X size={12} />
                  </button>
                )}
                <button
                  title="Review notes"
                  className={notes ? "mint" : ""}
                  onClick={() => setNotes(!notes)}
                >
                  <StickyNote size={15} />
                </button>
                <button
                  title="Zoom out"
                  onClick={() => setZoom(Math.max(1, zoom / 2))}
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  title="Zoom in"
                  onClick={() => setZoom(Math.min(16, zoom * 2))}
                >
                  <ZoomIn size={15} />
                </button>
                <button title="Fit timeline" onClick={() => setZoom(1)}>
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            <div className="timeline-content">
              <div className="track-labels">
                <div />
                {[
                  [Clapperboard, "Shots"],
                  [AudioLines, "Narration"],
                  [Anchor, "Cues"],
                  [Music, "Audio"],
                  [Type, "Cards"],
                  [Sparkles, "Ambience"],
                ].map(([Icon, name]: any) => (
                  <div key={name}>
                    <Icon size={13} />
                    {name}
                  </div>
                ))}
              </div>
              <div className="timeline-scroll" ref={timelineScroll}>
                <div
                  className="tracks"
                  style={{ width: `${zoom * 100}%` }}
                  onPointerDown={(e) => {
                    const el = e.currentTarget;
                    el.setPointerCapture(e.pointerId);
                    const r = el.getBoundingClientRect();
                    const t = Math.max(
                      0,
                      Math.min(
                        duration,
                        ((e.clientX - r.left) / r.width) * duration,
                      ),
                    );
                    rangeAnchor.current = e.shiftKey ? t : null;
                    if (e.shiftKey) {
                      setRange({ start: t, end: t });
                      setScope("range");
                    }
                    seek(t);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) {
                      const r = e.currentTarget.getBoundingClientRect();
                      const t = Math.max(
                        0,
                        Math.min(
                          duration,
                          ((e.clientX - r.left) / r.width) * duration,
                        ),
                      );
                      if (rangeAnchor.current !== null)
                        setRange({
                          start: Math.min(t, rangeAnchor.current),
                          end: Math.max(t, rangeAnchor.current),
                        });
                      seek(t);
                    }
                  }}
                  onPointerUp={() => {
                    rangeAnchor.current = null;
                  }}
                  onPointerCancel={() => {
                    rangeAnchor.current = null;
                  }}
                >
                  {range && duration > 0 && (
                    <div
                      className="timeline-range"
                      aria-label="Selected timeline range"
                      style={{
                        left: `${(range.start / duration) * 100}%`,
                        width: `${((range.end - range.start) / duration) * 100}%`,
                      }}
                    />
                  )}
                  <div className="ruler">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} style={{ left: `${i * 12.5}%` }}>
                        {time(((duration || 60) * i) / 8)}
                      </span>
                    ))}
                  </div>
                  <div className="track shots-track">
                    {p.shots.map((s, i) => (
                      <div
                        key={s.id}
                        className={s.status === "built" ? "built" : ""}
                        style={{
                          left: `${(s.start / duration) * 100}%`,
                          width: `${((s.end - s.start) / duration) * 100}%`,
                        }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <div className="track word-track">
                    {p.words.map((w, i) => (
                      <i
                        key={i}
                        style={{
                          left: `${(w.start / duration) * 100}%`,
                          width: `${((w.end - w.start) / duration) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="track cues-track">
                    {p.timeline?.cues.map((c) => (
                      <button
                        key={c.id}
                        title={c.label}
                        className="timeline-clip cue"
                        style={{ left: `${(c.time / duration) * 100}%` }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setModal("timeline")}
                      >
                        ◆
                      </button>
                    ))}
                    {p.shots.map((s) => (
                      <i
                        key={s.id}
                        style={{ left: `${(s.start / duration) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="track waveform">
                    {wave.length ? (
                      <svg viewBox="0 0 880 30" preserveAspectRatio="none">
                        {wave.map((v, i) => (
                          <line
                            key={i}
                            x1={i * 4}
                            x2={i * 4}
                            y1={15 - v * 14}
                            y2={15 + v * 14}
                            stroke="#88aa9a"
                            strokeWidth="2"
                          />
                        ))}
                      </svg>
                    ) : (
                      <small>No audio yet</small>
                    )}
                  </div>
                  <div className="track cards-track">
                    {p.timeline?.cards.map((c) => (
                      <button
                        key={c.id}
                        title={c.text}
                        className="timeline-clip"
                        style={{
                          left: `${(c.start / duration) * 100}%`,
                          width: `${((c.end - c.start) / duration) * 100}%`,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setModal("timeline")}
                      >
                        {c.text}
                      </button>
                    ))}
                    {p.shots
                      .filter((s) =>
                        s.scene?.elements.some((e: any) => e.type === "text"),
                      )
                      .map((s) => (
                        <div
                          key={s.id}
                          style={{
                            left: `${(s.start / duration) * 100}%`,
                            width: `${((s.end - s.start) / duration) * 100}%`,
                          }}
                        >
                          Text
                        </div>
                      ))}
                  </div>
                  <div className="track ambience-track">
                    {p.timeline?.audio.map((c) => (
                      <button
                        key={c.id}
                        title={`${c.track} ${c.volumeDb} dB`}
                        className="timeline-clip"
                        style={{
                          left: `${(c.start / duration) * 100}%`,
                          width: `${((c.end - c.start) / duration) * 100}%`,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setModal("timeline")}
                      >
                        {c.track}
                      </button>
                    ))}
                    {p.mix && (
                      <div>
                        {p.mixReport?.ambience.startsWith("assets/")
                          ? "Imported audio"
                          : "Procedural ambience"}{" "}
                        · {p.mixReport?.levelDb ?? -36} dB
                      </div>
                    )}
                  </div>
                  <div
                    className="playhead"
                    style={{
                      left: `${duration ? (position / duration) * 100 : 0}%`,
                    }}
                  >
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {notes && (
            <div className="review-notes">
              <div className="row">
                <input
                  placeholder={`Note at ${time(position)}…`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addNote();
                  }}
                />
                <Button small onClick={addNote}>
                  <Plus size={14} />
                  Pin note
                </Button>
              </div>
              {p.notes.map((n) => (
                <div className="note-row" key={n.id}>
                  <button onClick={() => seek(n.time)}>{time(n.time)}</button>
                  <span>{n.text}</span>
                </div>
              ))}
              {p.notes.length > 0 && (
                <Button
                  small
                  onClick={() =>
                    job("edit", {
                      scope: "video",
                      prompt: p.notes
                        .map((n) => `${time(n.time)} (${n.shotId}): ${n.text}`)
                        .join("\n"),
                    })
                  }
                >
                  Send all notes to agent
                </Button>
              )}
            </div>
          )}
        </section>
        <aside className="agent-panel">
          <div className="agent-header">
            <span>
              <Sparkles size={16} />
              {provider}
            </span>
            <div className="tabs compact-tabs">
              {["Chat", "History"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={tab === t ? "selected" : ""}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {tab === "Chat" ? (
            <>
              <div className="agent-log" ref={logs}>
                {!current ? (
                  <div className="agent-welcome">
                    <div className="spark-orbit">
                      <Sparkles size={23} />
                    </div>
                    <h3>Your creative co-pilot.</h3>
                    <p>
                      Build a story, refine a shot, or give every frame a little
                      more character.
                    </p>
                    <button onClick={() => setModal("script")}>
                      Start with the script
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => setModal("audio")}>
                      Bring in your voiceover
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => go("Connections")}>
                      Manage AI connections
                      <ArrowUp size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="run-label">
                      <Badge status={current.status}>
                        {current.action} · {current.status}
                      </Badge>
                      <small>{ago(current.createdAt)}</small>
                    </div>
                    {current.usage && (
                      <div className="usage-summary">
                        <strong>{current.provider || provider}</strong>
                        <span>
                          {(current.usage.input_tokens || 0).toLocaleString()}{" "}
                          input ·{" "}
                          {(current.usage.output_tokens || 0).toLocaleString()}{" "}
                          output tokens
                        </span>
                        <span>
                          {current.startedAt
                            ? `${Math.round((new Date(current.finishedAt || Date.now()).getTime() - new Date(current.startedAt).getTime()) / 1000)}s elapsed`
                            : "Queued"}
                          {current.estimatedCost !== undefined
                            ? ` · $${current.estimatedCost.toFixed(4)} estimated API equivalent`
                            : " · Price not configured"}
                        </span>
                        <small>
                          Project total:{" "}
                          {jobs
                            .reduce(
                              (n, j) =>
                                n +
                                (j.usage?.input_tokens || 0) +
                                (j.usage?.output_tokens || 0),
                              0,
                            )
                            .toLocaleString()}{" "}
                          tokens. Subscription usage is not an extra API charge.
                        </small>
                      </div>
                    )}
                    {current.events.map((e, i) => (
                      <div className={`log-row ${e.type}`} key={i}>
                        {e.type === "error" ? (
                          <X size={13} />
                        ) : e.type === "success" ? (
                          <Check size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        <span>{e.text}</span>
                      </div>
                    ))}
                    {current.status === "running" && (
                      <div className="job-progress">
                        <Busy
                          text={`${Math.round(current.progress)}% · Working`}
                        />
                        <progress max="100" value={current.progress} />
                      </div>
                    )}
                    {current.status === "error" && (
                      <Button
                        small
                        onClick={() =>
                          act(() => api(`/jobs/${current.id}/retry`, "POST"))
                        }
                      >
                        Retry from checkpoint
                      </Button>
                    )}
                    {current.status === "done" && (
                      <div className="result-card">
                        <Badge status="done">Completed</Badge>
                        <p>
                          {current.commit
                            ? "Changes saved in Git history."
                            : "Output saved to your project folder."}
                        </p>
                        {current.commit && (
                          <Button small onClick={() => setTab("History")}>
                            <History size={13} />
                            Review changes
                          </Button>
                        )}
                        {!!current.comparisons?.length && (
                          <Button
                            small
                            onClick={() => {
                              setComparison(current.comparisons!);
                              setModal("comparison");
                            }}
                          >
                            Before / After
                          </Button>
                        )}
                        {current.output && (
                          <a
                            className="button small"
                            href={media(p, current.output)}
                            download
                          >
                            <Download size={13} />
                            Download MP4
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="agent-model-bar">
                <Badge status={capability.tier ? "done" : "pending"}>
                  {capability.tier
                    ? `Tier ${capability.tier}`
                    : "Not calibrated"}
                </Badge>
                <span>
                  {running
                    ? `Working${running.model ? ` · ${running.model}` : ""}`
                    : "Model for this project"}
                </span>
                <ProjectModelPicker
                  project={p}
                  state={state}
                  refresh={refresh}
                  notify={notify}
                  running={!!running}
                />
              </div>
              <div className="agent-composer">
                {capability.lite && (
                  <p className="form-hint">
                    Lite mode · Expect simpler visuals and more manual fixes.
                    New scenes use up to 40 elements. Choose a stronger model
                    here or configure an independent QA model in Connections.
                  </p>
                )}
                {scope === "range" && range && (
                  <small className="range-caption">
                    Editing{" "}
                    {
                      p.shots.filter(
                        (s) => s.end > range.start && s.start < range.end,
                      ).length
                    }{" "}
                    whole shots overlapping {time(range.start)}–
                    {time(range.end)}.
                  </small>
                )}
                {shot && (
                  <div className="context-chip">
                    <Clapperboard size={13} />
                    <span>{selected || shot.title}</span>
                    <button
                      title="View scene source"
                      onClick={() => {
                        setDiff(JSON.stringify(shot.scene, null, 2));
                        setModal("source");
                      }}
                    >
                      <Code size={13} />
                    </button>
                  </div>
                )}
                <textarea
                  aria-label="Edit instructions"
                  placeholder={
                    running
                      ? "Queue your next change…"
                      : "Describe what you’d like to change…"
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="composer-bottom">
                  <div className="tabs scope-tabs">
                    {[
                      ["selection", "Selection"],
                      ["shot", "Shot"],
                      ["range", "Range"],
                      ["video", "Video"],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        className={scope === v ? "selected" : ""}
                        onClick={() => setScope(v)}
                        disabled={
                          (v === "selection" && !selected) ||
                          (v === "range" &&
                            (!range || range.end <= range.start))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="send-button"
                    title="Apply edit"
                    disabled={
                      !prompt.trim() ||
                      busy ||
                      !shot?.scene ||
                      (scope === "range" &&
                        (!range || range.end <= range.start))
                    }
                    onClick={async () => {
                      const j = await job("edit", {
                        scope,
                        shotId: shot?.id,
                        elementId: selected,
                        range,
                        prompt,
                      });
                      if (j) setPrompt("");
                    }}
                  >
                    <ArrowUp size={17} />
                  </button>
                </div>
                <div className="agent-status">
                  <span>
                    <i />
                    {running ? "Job in progress" : "Ready when you are"}
                  </span>
                  {running ? (
                    <button
                      onClick={() =>
                        act(() => api(`/jobs/${running.id}/stop`, "POST"))
                      }
                    >
                      <Square size={10} />
                      Stop
                    </button>
                  ) : (
                    shot?.scene && (
                      <div className="row">
                        <button
                          onClick={() =>
                            job("ultra", { scope: "shot", shotId: shot.id })
                          }
                        >
                          <Sparkles size={11} />
                          UltraEdit
                        </button>
                        <button onClick={() => setModal("upgrade-plus")}>
                          <Sparkles size={11} />
                          Ultra Edit+
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="history-list">
              {history.map((h) => (
                <div className="history-card" key={h.hash}>
                  <strong>{h.message}</strong>
                  <small>
                    {ago(h.date)} · {h.hash.slice(0, 7)}
                  </small>
                  <div className="row">
                    <Button
                      small
                      onClick={async () => {
                        const r = await act(() =>
                          api(`/projects/${p.id}/diff/${h.hash}`),
                        );
                        if (r) {
                          setDiff(r.diff);
                          setModal("source");
                        }
                      }}
                    >
                      View changes
                    </Button>
                    {jobs.find((j) => j.commit === h.hash)?.comparisons
                      ?.length ? (
                      <Button
                        small
                        onClick={() => {
                          setComparison(
                            jobs.find((j) => j.commit === h.hash)!.comparisons!,
                          );
                          setModal("comparison");
                        }}
                      >
                        Before / After
                      </Button>
                    ) : null}
                    {history.at(-1)?.hash !== h.hash && (
                      <Button
                        small
                        onClick={() =>
                          act(
                            () =>
                              api(`/projects/${p.id}/revert`, "POST", {
                                hash: h.hash,
                              }),
                            "Change reverted",
                          )
                        }
                      >
                        <Undo2 size={12} />
                        Revert
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <audio
        ref={audio}
        src={media(p, p.mix || p.audio)}
        onEnded={() => {
          if (loop) {
            seek(0);
            audio.current?.play();
          } else setPlaying(false);
        }}
      />
      {modal === "timeline" && (
        <TimelineEditor
          project={p}
          at={position}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
        />
      )}
      {modal === "trim" && (
        <SilenceTrimmer
          project={p}
          wave={wave}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
        />
      )}
      {modal === "references" && (
        <ReferencePicker
          project={p}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
          running={!!running}
        />
      )}
      {modal === "style-parameters" && (
        <StyleParameters
          project={p}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
        />
      )}
      {modal === "character" && (
        <CharacterBuilder
          project={p}
          state={state}
          shotId={shot?.id}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
        />
      )}
      {modal === "takes" && (
        <RetakeEditor
          project={p}
          state={state}
          close={() => setModal("")}
          refresh={refresh}
          notify={notify}
        />
      )}
      {modal === "upgrade-plus" && (
        <Modal
          title="Ultra Edit+ · Target-guided upgrade"
          onClose={() => setModal("")}
        >
          <div className="modal-body">
            <p>{qualityDescriptions[5]}</p>
            <p>
              The current shot will use your Ultra role model. The matching loop
              has a two-minute budget after concept generation. If it fails, the
              original scene is preserved.
            </p>
            <label>
              Upgrade direction
              <textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="More detailed piping, realistic lighting, connected structural supports…"
              />
            </label>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={busy || !!running || !shot?.scene}
              onClick={() =>
                job("ultra", {
                  scope: "shot",
                  shotId: shot?.id,
                  quality: "Ultra Edit+",
                  secondsPerShot: 120,
                  prompt: direction,
                })
              }
            >
              Generate target & upgrade shot
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "script" && (
        <Modal title="The script" wide onClose={() => setModal("")}>
          <div className="modal-body">
            <ScriptSettings
              ref={scriptSettings}
              project={p}
              disabled={!!running}
              refresh={refresh}
              notify={notify}
            />
            <div className="row spread">
              <div className="tabs">
                <button
                  className={scriptTab === "Narration" ? "selected" : ""}
                  onClick={() => setScriptTab("Narration")}
                >
                  Narration
                </button>
                <button
                  className={scriptTab === "Research" ? "selected" : ""}
                  onClick={() => setScriptTab("Research")}
                >
                  Research & sources
                </button>
              </div>
              <small>
                {script.trim().split(/\s+/).filter(Boolean).length} words · ~
                {time(
                  (script.trim().split(/\s+/).filter(Boolean).length / 150) *
                    60,
                )}
              </small>
            </div>
            <textarea
              className="script-editor"
              aria-label={
                scriptTab === "Narration"
                  ? "Narration script"
                  : "Research and sources"
              }
              value={scriptTab === "Narration" ? script : research}
              onChange={(e) =>
                scriptTab === "Narration"
                  ? setScript(e.target.value)
                  : setResearch(e.target.value)
              }
              placeholder={
                scriptTab === "Narration"
                  ? "Your story, in your own words. Use ## for chapter headings."
                  : "Sources, facts, framing and notes…"
              }
            />
            {p.needsReview && (
              <p className="notice">
                Review research and source accuracy before producing factual
                content.
              </p>
            )}
          </div>
          <footer>
            <Button
              small
              onClick={async () => {
                const saved = await act(async () => {
                  await scriptSettings.current?.save();
                  return true;
                });
                if (saved) await job("script");
              }}
              disabled={busy || !!running}
            >
              <Sparkles size={14} />
              Write with AI
            </Button>
            <Button
              small
              onClick={() =>
                navigator.clipboard
                  .writeText(script.replace(/^#+.*$/gm, "").trim())
                  .then(() => notify("Copied narration for TTS"))
              }
            >
              Copy for TTS
            </Button>
            <span className="spacer" />
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={busy || !!running}
              onClick={async () => {
                const r = await act(async () => {
                  await scriptSettings.current?.save();
                  return api(`/projects/${p.id}`, "PATCH", {
                    script,
                    research,
                  });
                }, "Script saved");
                if (r) setModal("");
              }}
            >
              Save script
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "audio" && (
        <Modal title="Give your story a voice" onClose={() => setModal("")}>
          <div className="modal-body">
            <div className="tabs inset">
              <button onClick={() => cameraFile.current?.click()}>
                Import camera video
              </button>
              <button
                className={voiceProvider === "import" ? "selected" : ""}
                onClick={() => setVoiceProvider("import")}
              >
                My recording
              </button>
              <button
                className={voiceProvider === "windows" ? "selected" : ""}
                onClick={() => setVoiceProvider("windows")}
              >
                Local voice · Free
              </button>
              <button
                className={voiceProvider === "elevenlabs" ? "selected" : ""}
                onClick={() => setVoiceProvider("elevenlabs")}
              >
                ElevenLabs
              </button>
            </div>
            {voiceProvider === "import" ? (
              <>
                <button
                  className="dropzone"
                  onClick={() => audioFile.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) {
                      const form = new FormData();
                      form.append("file", f);
                      act(
                        () => api(`/projects/${p.id}/audio`, "POST", form),
                        "Voiceover imported",
                      );
                    }
                  }}
                >
                  <Upload size={27} />
                  <strong>Choose a recording or drop it here</strong>
                  <span>WAV, MP3, M4A, FLAC, OGG or a video file</span>
                </button>
                <p className="form-hint">
                  After importing, clean the audio and run local word timing in
                  the pipeline.
                </p>
              </>
            ) : (
              <>
                <label>
                  Voice provider
                  <select
                    value={voiceProvider}
                    onChange={(e) => {
                      setVoiceProvider(e.target.value);
                      setVoice("");
                    }}
                  >
                    {[
                      ["windows", "Windows"],
                      ["elevenlabs", "ElevenLabs"],
                      ["fish", "Fish Audio"],
                      ["piper", "Piper"],
                      ["kokoro", "Kokoro"],
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {voiceProvider === "windows"
                    ? "Windows voice"
                    : "Voice ID (leave blank for configured default)"}
                  {voiceProvider === "windows" ? (
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                    >
                      <option value="">System default</option>
                      {voices.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      placeholder="Voice ID, or Piper speaker number"
                    />
                  )}
                </label>
                <p className="notice">
                  {voiceProvider === "windows"
                    ? "Uses your installed Windows speech engine. Word timings come directly from speech events. Audio is cleaned automatically."
                    : ["piper", "kokoro"].includes(voiceProvider)
                      ? "Uses your configured local speech engine. Word timing runs locally after synthesis."
                      : "Uses the provider credentials saved in Connections and consumes your provider allowance."}
                </p>
                <p className="form-hint">
                  {p.script.trim().split(/\s+/).filter(Boolean).length}{" "}
                  narration words · {p.language.toUpperCase()}
                </p>
              </>
            )}
            <div className="audio-status">
              {p.audio ? (
                <>
                  <Check size={16} />
                  <span>
                    Voiceover ready · {time(p.durationSec)} ·{" "}
                    {p.timingSource || "Words not timed yet"}
                  </span>
                </>
              ) : (
                <span>No voiceover added yet</span>
              )}
            </div>
            <Button small onClick={() => wordsFile.current?.click()}>
              Import word timestamps (.json)
            </Button>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Close</Button>
            {voiceProvider !== "import" && (
              <Button
                primary
                disabled={busy || !!running || !p.script.trim()}
                onClick={() => job("tts", { provider: voiceProvider, voice })}
              >
                <Mic size={15} />
                Generate voiceover
              </Button>
            )}
          </footer>
        </Modal>
      )}
      {modal === "build" && (
        <Modal title="Build your video" onClose={() => setModal("")}>
          <div className="modal-body">
            <div className="build-intro">
              <Sparkles size={24} />
              <p>
                Your agent turns timed narration into animated scenes, checks
                rendered frames, and saves every shot as it goes.
              </p>
            </div>
            <label>
              Direction for this build <span>optional</span>
              <textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="A warmer palette, more visual detail, a calmer pace…"
              />
            </label>
            <div className="suggestion-chips">
              {[
                "Make text readable on a phone",
                "Use rich, specific visual details",
                "Keep a consistent color palette",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setDirection((v) => v + (v ? "\n" : "") + s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <label>
              Quality <strong className="mint">{qualityLevels[quality]}</strong>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
            <div className="quality-stops">
              {qualityLevels.map((s, i) => (
                <span key={s} className={i === quality ? "mint" : ""}>
                  {s}
                </span>
              ))}
            </div>
            <p className="form-hint">{qualityDescriptions[quality]}</p>
            <div className="notice">
              {p.pipeline.wordsTimed === "done"
                ? `${p.words.length} timed words are ready. Completed shots can be previewed while the rest build.`
                : "Add a voiceover and time the words before building scenes."}
            </div>
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={busy || p.pipeline.wordsTimed !== "done" || !!running}
              onClick={() =>
                job("build", {
                  quality: qualityLevels[quality],
                  direction,
                })
              }
            >
              <Sparkles size={15} />
              Start build
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="Export your video" onClose={() => setModal("")}>
          <div className="modal-body">
            <div className="export-summary">
              <div className="empty-icon">
                <Download size={25} />
              </div>
              <div>
                <h3>{p.title}</h3>
                <p>
                  {time(duration)} · {p.shots.length} shots · MP4 / H.264
                </p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Resolution
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  <option>720p</option>
                  <option>1080p</option>
                  <option>4K</option>
                </select>
              </label>
              <label>
                Frame rate
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                >
                  {[24, 25, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="notice">
              Frames render locally with the same engine as the preview. A
              separate SRT caption file is included. Export time depends on
              resolution and hardware.
            </p>
            {p.lastExport && (
              <a className="button" href={media(p, p.lastExport)} download>
                <Download size={15} />
                Download last export
              </a>
            )}
          </div>
          <footer>
            <Button onClick={() => setModal("")}>Cancel</Button>
            <Button
              primary
              disabled={
                busy ||
                !!running ||
                !p.shots.length ||
                p.shots.some((s) => !s.scene)
              }
              onClick={() => job("export", { resolution, fps })}
            >
              <Download size={15} />
              Export MP4
            </Button>
          </footer>
        </Modal>
      )}
      {modal === "assets" && (
        <Assets
          project={p}
          shotId={shot?.id}
          onClose={() => setModal("")}
          notify={notify}
          refresh={refresh}
        />
      )}
      {modal === "source" && (
        <Modal
          title="Project source & changes"
          wide
          onClose={() => setModal("")}
        >
          <div className="modal-body">
            <pre className="source-code">{diff}</pre>
          </div>
        </Modal>
      )}
      {modal === "comparison" && (
        <Modal title="Before / After" wide onClose={() => setModal("")}>
          <div className="modal-body comparison-list">
            {comparison.map((item) => (
              <section key={item.shotId}>
                <h3>
                  {item.title || item.shotId} · {time(item.time)}
                </h3>
                {item.target && (
                  <figure>
                    <img
                      src={media(p, item.target)}
                      alt="Target concept"
                      style={{
                        width: "100%",
                        maxHeight: 440,
                        objectFit: "contain",
                      }}
                    />
                    <figcaption>Generated target concept</figcaption>
                  </figure>
                )}
                <div className="comparison-pair">
                  <figure>
                    {item.beforeClip ? (
                      <video
                        controls
                        muted
                        loop
                        preload="metadata"
                        poster={media(p, item.before)}
                        src={media(p, item.beforeClip)}
                        aria-label="Before the edit"
                      />
                    ) : (
                      <img src={media(p, item.before)} alt="Before the edit" />
                    )}
                    <figcaption>Before</figcaption>
                  </figure>
                  <figure>
                    {item.afterClip ? (
                      <video
                        controls
                        muted
                        loop
                        preload="metadata"
                        poster={media(p, item.after)}
                        src={media(p, item.afterClip)}
                        aria-label="After the edit"
                      />
                    ) : (
                      <img src={media(p, item.after)} alt="After the edit" />
                    )}
                    <figcaption>After</figcaption>
                  </figure>
                </div>
                {item.beforeClip && (
                  <Button
                    small
                    onClick={(e) => {
                      const videos = e.currentTarget
                        .closest("section")
                        ?.querySelectorAll("video");
                      videos?.forEach((v) => {
                        v.currentTime = 0;
                        void v.play().catch(() => {});
                      });
                    }}
                  >
                    Play both motion previews
                  </Button>
                )}
              </section>
            ))}
          </div>
        </Modal>
      )}
      {modal === "shortcuts" && (
        <Modal title="Editor shortcuts" onClose={() => setModal("")}>
          <div className="modal-body shortcut-list">
            {[
              ["Space", "Play / pause"],
              ["← / →", "Seek one second"],
              ["Ctrl + K", "Search / command palette"],
              ["Click preview", "Select an element"],
              ["Drag timeline", "Scrub video"],
              ["Shift + drag", "Select shots overlapping a time range"],
              ["Ctrl + scroll", "Zoom timeline"],
              ["Ctrl + Enter", "Create project in new-project dialog"],
            ].map(([key, label]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
      <input
        hidden
        ref={cameraFile}
        type="file"
        accept="video/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const form = new FormData();
            form.append("file", file);
            const result = await act(
              () => api(`/projects/${p.id}/camera`, "POST", form),
              "Preparing camera footage and transcript",
            );
            if (result) setModal("");
          }
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={audioFile}
        type="file"
        accept="audio/*,video/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const form = new FormData();
            form.append("file", f);
            act(
              () => api(`/projects/${p.id}/audio`, "POST", form),
              "Voiceover imported",
            );
          }
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={wordsFile}
        type="file"
        accept=".json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f)
            try {
              const words = JSON.parse(await f.text());
              await act(
                () =>
                  api(`/projects/${p.id}/words`, "POST", {
                    words: Array.isArray(words) ? words : words.words,
                  }),
                "Word timings imported",
              );
            } catch (err: any) {
              notify(err.message);
            }
          e.target.value = "";
        }}
      />
    </div>
  );
}

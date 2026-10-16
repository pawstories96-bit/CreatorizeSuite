import { useEffect, useState } from "react";
import { Sparkles, Check, RefreshCw } from "lucide-react";
import { api, type State } from "./types";
import { Button, Badge } from "./ui";
export function AudienceLearning({
  state,
  projectId,
  refresh,
  notify,
}: {
  state: State;
  projectId?: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [videos, setVideos] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [evidence, setEvidence] = useState<any>(null);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const load = () => act(async () => setVideos(await api("/youtube/videos")));
  useEffect(() => {
    if (state.settings.vault?.google) load();
  }, [state.settings.vault?.google]);
  return (
    <section className="panel settings-section">
      <div className="section-head">
        <div>
          <h2>Learn from your audience</h2>
          <p>
            Review comments and retention evidence before adding a rule to{" "}
            {projectId ? "the active project" : "your workspace"}.
          </p>
        </div>
        <Button
          small
          disabled={busy || !state.settings.vault?.google}
          onClick={load}
        >
          <RefreshCw size={14} />
          Refresh videos
        </Button>
      </div>
      <div className="form-grid">
        <label><input type="checkbox" checked={state.settings.autoLearn === true} onChange={e => { const enabled = e.target.checked; void act(async () => { await api("/settings", "POST", { autoLearn: enabled }); await refresh(); notify(enabled ? "Automatic audience learning enabled" : "Automatic audience learning disabled"); }); }} /> Automatically learn from uploaded videos</label>
        <label>Automatic rule scope<select value={state.settings.learningScope || "global"} onChange={e => { const scope = e.target.value; void act(async () => { await api("/settings", "POST", { learningScope: scope }); await refresh(); }); }}><option value="global">All videos</option><option value="project">One project</option></select></label>
      </div>
      <p className="form-hint">When enabled, checks uploaded videos after 24 hours, then every 48 hours while the app is open. Automatic rules require at least two supporting evidence records. Uncorroborated suggestions remain available for review.</p>
      <div className="row">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setEvidence(null);
          }}
        >
          <option value="">Choose a channel video</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        <Button
          disabled={!selected || busy}
          onClick={() =>
            act(async () =>
              setEvidence(await api(`/youtube/videos/${selected}/insights`)),
            )
          }
        >
          View evidence
        </Button>
        <Button
          primary
          disabled={!selected || busy}
          onClick={() =>
            act(async () => {
              await api("/youtube/learn", "POST", {
                videoId: selected,
                projectId,
              });
              await refresh();
              notify("Audience analysis queued");
            })
          }
        >
          <Sparkles size={14} />
          Suggest improvements
        </Button>
      </div>
      {evidence && (
        <div className="audience-evidence">
          {evidence.warnings.map((w: string) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          {!!evidence.retention.length && (
            <>
              <h3>Audience retention</h3>
              <div className="analytics-chart">
                {evidence.retention.map((r: any) => (
                  <div
                    key={r.id}
                    title={`${Math.round(r.progress * 100)}% of video: ${Math.round(r.watchRatio * 100)}% watch ratio`}
                    style={{ height: `${Math.min(100, r.watchRatio * 100)}%` }}
                  />
                ))}
              </div>
            </>
          )}
          <details>
            <summary>{evidence.comments.length} relevant comments</summary>
            {evidence.comments.map((c: any) => (
              <blockquote key={c.id}>
                <p>{c.text}</p>
                <a href={c.url} target="_blank" rel="noreferrer">
                  View comment · {c.likes} likes
                </a>
              </blockquote>
            ))}
          </details>
        </div>
      )}
      {state.jobs
        .filter(
          (j) =>
            j.action === "learn" &&
            ["queued", "running", "error"].includes(j.status),
        )
        .map((j) => (
          <p className="notice" key={j.id}>
            <Badge status={j.status}>{j.status}</Badge>{" "}
            {j.error || j.events.at(-1)?.text}
          </p>
        ))}
      {state.learnings
        .filter((r) => !selected || r.videoId === selected)
        .map((r) => (
          <div className="learning-report" key={r.id}>
            {r.suggestions.map((s: any, i: number) => (
              <div className="learning-suggestion" key={i}>
                <h3>{s.rule}</h3>
                <p>{s.reason}</p>
                <details>
                  <summary>Supporting evidence ({s.evidence.length})</summary>
                  {s.evidence.map((id: string) => {
                    const item = [
                      ...r.evidence.comments,
                      ...r.evidence.retention,
                    ].find((x) => x.id === id);
                    return (
                      <blockquote key={id}>
                        {item.text ||
                          `${Math.round(item.progress * 100)}% through video: ${(item.watchRatio * 100).toFixed(1)}% watch ratio; relative retention ${item.relativePerformance}`}{" "}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            Source comment
                          </a>
                        )}
                      </blockquote>
                    );
                  })}
                </details>
                <Button
                  small
                  disabled={busy || r.approved.includes(i)}
                  onClick={() =>
                    act(async () => {
                      await api(`/learnings/${r.id}/approve`, "POST", {
                        index: i,
                      });
                      await refresh();
                      notify("Approved rule added to Memory");
                    })
                  }
                >
                  <Check size={13} />
                  {r.approved.includes(i)
                    ? "Added to Memory"
                    : "Approve as memory rule"}
                </Button>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

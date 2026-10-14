import { useState } from "react";
import { api, type State } from "./types";
import { Button } from "./ui";
export function ThumbnailHelper({
  state,
  projectId,
  refresh,
  notify,
}: {
  state: State;
  projectId: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [refs, setRefs] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const project = state.projects.find((p) => p.id === projectId),
    job = state.jobs.find(
      (j) => j.projectId === projectId && j.action === "thumbnail-helper",
    ),
    result = (job as any)?.result;
  const run = async () => {
    setBusy(true);
    try {
      await api(`/projects/${projectId}/jobs`, "POST", {
        action: "thumbnail-helper",
        options: {
          references: state.thumbnails
            .filter((t) => refs.includes(t.id))
            .map((t) => ({ projectId: t.projectId, path: t.path })),
        },
      });
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const channel = state.channels.find((c) => c.id === project?.channelId);
    if (!channel)
      return notify("Assign this project to a channel to save its style key.");
    try {
      await api("/channels", "POST", {
        ...channel,
        thumbnailStyleKey: result.styleKey,
      });
      await refresh();
      notify("Style key saved for this channel’s future image prompts");
    } catch (e: any) {
      notify(e.message);
    }
  };
  return (
    <section className="panel settings-section">
      <h2>Thumbnail style helper</h2>
      <p>
        Choose reference images to analyze, then create three original prompt
        directions. Every generated image remains in the library.
      </p>
      <div className="row">
        {state.thumbnails.slice(0, 30).map((t) => (
          <label key={t.id}>
            <input
              type="checkbox"
              checked={refs.includes(t.id)}
              onChange={(e) =>
                setRefs((r) =>
                  e.target.checked
                    ? [...r, t.id].slice(0, 8)
                    : r.filter((id) => id !== t.id),
                )
              }
            />
            {t.name}
          </label>
        ))}
      </div>
      <Button
        disabled={
          !project || busy || ["queued", "running"].includes(job?.status || "")
        }
        onClick={run}
      >
        Analyze & suggest prompts
      </Button>
      {job && (
        <p>
          {job.status}
          {job.error ? `: ${job.error}` : ""}
        </p>
      )}
      {result && (
        <div className="form-stack">
          <p>{Object.values(result.analysis || {}).join(" ")}</p>
          <label>
            Reusable style key
            <textarea readOnly rows={4} value={result.styleKey} />
          </label>
          <Button disabled={!project?.channelId} onClick={save}>
            Use style key for channel
          </Button>
          {result.prompts.map((prompt: string, i: number) => (
            <label key={i}>
              Direction {i + 1}
              <textarea readOnly rows={3} value={prompt} />
              <Button
                small
                onClick={() =>
                  navigator.clipboard
                    .writeText(prompt)
                    .then(() => notify("Prompt copied"))
                }
              >
                Copy prompt
              </Button>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

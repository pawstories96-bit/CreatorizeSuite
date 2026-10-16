import { useEffect, useRef, useState } from "react";
import { api, media, type Project, type State } from "./types";
import { Button, Modal, Badge } from "./ui";
export function RetakeEditor({
  project: p,
  state,
  close,
  refresh,
  notify,
}: {
  project: Project;
  state: State;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null),
    stopAt = useRef<number | null>(null);
  const job = state.jobs.find(
      (j) => j.projectId === p.id && j.action === "analyze-takes",
    ),
    analysis = (job as any)?.result,
    running = state.jobs.some(
      (j) => j.projectId === p.id && ["running", "queued"].includes(j.status),
    );
  useEffect(() => {
    setSelected(analysis?.takes.map((t: any) => t.id) || []);
  }, [analysis?.id]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const play = (start: number, end: number) => {
    if (!audio.current) return;
    audio.current.currentTime = Math.max(0, start - 0.1);
    stopAt.current = end + 0.1;
    void audio.current.play();
  };
  const current = analysis?.source === p.audio;
  return (
    <Modal title="Review repeated takes" wide onClose={close}>
      <div className="modal-body">
        <p>
          Find abandoned repeated starts and keep the later complete delivery.
          Suggestions must share at least three opening words. Listen before
          applying; transcript analysis cannot judge vocal performance or
          intentional repetition.
        </p>
        <audio
          ref={audio}
          controls
          src={media(p, p.audio)}
          style={{ width: "100%" }}
          onTimeUpdate={(e) => {
            if (
              stopAt.current != null &&
              e.currentTarget.currentTime >= stopAt.current
            ) {
              e.currentTarget.pause();
              stopAt.current = null;
            }
          }}
        />
        <div className="row">
          <Button
            disabled={busy || running || !p.words.length}
            onClick={() =>
              void act(async () => {
                await api(`/projects/${p.id}/jobs`, "POST", {
                  action: "analyze-takes",
                });
              })
            }
          >
            Find repeated takes
          </Button>
          <Button
            disabled={busy || running || !p.words.length}
            onClick={() =>
              void act(async () => {
                await api(`/projects/${p.id}/jobs`, "POST", {
                  action: "analyze-takes",
                  options: { autoApply: true },
                });
                notify(
                  "Automatic retake cleanup queued. Original media is retained.",
                );
              })
            }
          >
            Auto-cut repeated takes
          </Button>
        </div>
        {job && (
          <p>
            <Badge status={job.status}>{job.status}</Badge>{" "}
            {job.error || job.events.at(-1)?.text}
          </p>
        )}
        {analysis && !current && (
          <p className="notice">
            This analysis belongs to an earlier recording version. Analyze the
            current recording to make further edits.
          </p>
        )}
        {analysis?.takes.map((take: any) => (
          <section className="panel reference-saved" key={take.id}>
            <label>
              <input
                type="checkbox"
                disabled={!current || running}
                checked={selected.includes(take.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, take.id]
                      : ids.filter((id) => id !== take.id),
                  )
                }
              />
              Remove earlier take
            </label>
            <p>
              <strong>Remove:</strong> {take.removed}
            </p>
            <p>
              <strong>Keep:</strong> {take.kept}
            </p>
            <small>{take.reason}</small>
            {current && (
              <div className="row">
                <Button
                  small
                  onClick={() =>
                    play(
                      p.words[take.removeStart].start,
                      p.words[take.removeEnd].end,
                    )
                  }
                >
                  Listen to earlier take
                </Button>
                <Button
                  small
                  onClick={() =>
                    play(
                      p.words[take.keepStart].start,
                      p.words[take.keepEnd].end,
                    )
                  }
                >
                  Listen to kept take
                </Button>
              </div>
            )}
          </section>
        ))}
      </div>
      <footer>
        <Button onClick={close}>Close</Button>
        <Button
          primary
          disabled={busy || running || !current || !selected.length}
          onClick={() =>
            void act(async () => {
              await api(`/projects/${p.id}/jobs`, "POST", {
                action: "apply-takes",
                options: { analysisId: analysis.id, selected },
              });
              notify(
                "Selected repeated takes are being cut with synchronized camera and audio.",
              );
              close();
            })
          }
        >
          Apply selected take cuts
        </Button>
      </footer>
    </Modal>
  );
}

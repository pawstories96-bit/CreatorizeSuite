import { useEffect, useState } from "react";
import { api, type Project, type State } from "./types";
import { Button, Modal, Badge } from "./ui";
export function CharacterBuilder({
  project: p,
  state,
  shotId,
  close,
  refresh,
  notify,
}: {
  project: Project;
  state: State;
  shotId?: string;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [selected, setSelected] = useState(""),
    [pose, setPose] = useState("idle"),
    [busy, setBusy] = useState(false);
  const job = state.jobs.find(
      (j) => j.projectId === p.id && j.action === "character",
    ),
    running = state.jobs.some(
      (j) => j.projectId === p.id && ["running", "queued"].includes(j.status),
    );
  useEffect(() => {
    if (job?.status === "done" && (job as any).result?.id)
      setSelected((job as any).result.id);
  }, [job?.id, job?.status]);
  const character =
    state.characters?.find((c) => c.id === selected) || state.characters?.[0];
  return (
    <Modal title="2D rigged character builder" wide onClose={close}>
      <div className="modal-body">
        <div className="character-builder-grid">
          <div>
            <label>
              Describe the character
              <textarea
                aria-label="Character description"
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A friendly researcher with round glasses, curly dark hair, a mustard shirt and navy trousers…"
              />
            </label>
            <p className="form-hint">
              Creates a reusable vector rig with shoulders, elbows, hips and
              knees. Idle breathing, blinking and poses run in the shared
              preview/export engine.
            </p>
            <Button
              primary
              disabled={busy || running || !prompt.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/projects/${p.id}/jobs`, "POST", {
                    action: "character",
                    options: { prompt },
                  });
                  await refresh();
                } catch (e: any) {
                  notify(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Design character
            </Button>
            {job && (
              <p>
                <Badge status={job.status}>{job.status}</Badge>{" "}
                {job.error || job.events.at(-1)?.text}
              </p>
            )}
            {character && (
              <>
                <label>
                  Saved character
                  <select
                    aria-label="Saved character"
                    value={character.id}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {state.characters?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preview pose
                  <select
                    aria-label="Character preview pose"
                    value={pose}
                    onChange={(e) => setPose(e.target.value)}
                  >
                    {["idle", "walk", "run", "point", "sit"].map((pose) => (
                      <option key={pose}>{pose}</option>
                    ))}
                  </select>
                </label>
                <p>{character.prompt}</p>
              </>
            )}
          </div>
          <div>
            {character ? (
              <iframe
                className="character-preview"
                title="Live rigged character preview"
                key={`${character.id}-${pose}`}
                src={`/player.html?character=${character.id}&pose=${pose}&width=640&height=360`}
              />
            ) : (
              <div className="notice">
                Your designed character will appear here with a live idle
                animation.
              </div>
            )}
          </div>
        </div>
      </div>
      <footer>
        <Button onClick={close}>Close</Button>
        <Button
          primary
          disabled={
            busy ||
            running ||
            !character ||
            !p.shots.find((s) => s.id === shotId)?.scene
          }
          onClick={async () => {
            setBusy(true);
            try {
              await api(
                `/projects/${p.id}/characters/${character.id}/insert`,
                "POST",
                { shotId },
              );
              await refresh();
              notify(
                "Rigged character inserted. Select it in the viewport to request pose or design changes.",
              );
              close();
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Insert into current shot
        </Button>
      </footer>
    </Modal>
  );
}

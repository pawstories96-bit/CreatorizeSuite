import { useRef, useState } from "react";
import { api, type State } from "./types";
import { Button, Modal } from "./ui";
export function StyleTrainer({
  state,
  close,
  refresh,
  notify,
  initialProject,
}: {
  state: State;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  initialProject?: string;
}) {
  const [projectId, setProjectId] = useState(
      initialProject || state.projects[0]?.id || "",
    ),
    [name, setName] = useState(""),
    [base, setBase] = useState("3d"),
    [direction, setDirection] = useState(""),
    [refs, setRefs] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [apply, setApply] = useState(true);
  const file = useRef<HTMLInputElement>(null),
    project = state.projects.find((p) => p.id === projectId);
  return (
    <Modal title="Train a custom visual style" wide onClose={close}>
      <div className="modal-body">
        <p>
          Extract reusable composition, material, lighting and motion rules from
          one to five references. The app saves a style specification and
          rendering module in your local style library.
        </p>
        <div className="form-grid">
          <label>
            Reference project
            <select
              aria-label="Style reference project"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setRefs([]);
              }}
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Style name
            <input
              aria-label="Trained style name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Starting renderer
            <select
              aria-label="Starting style renderer"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              {state.styles
                .filter((s) => !s.baseStyle)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Direction
          <textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="Keep the lighting and materials, with simpler characters and slower camera moves…"
          />
        </label>
        <input
          hidden
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = "";
            if (!selected || !project) return;
            setBusy(true);
            try {
              const form = new FormData();
              form.append("file", selected);
              const uploaded = await api(
                `/projects/${projectId}/asset`,
                "POST",
                form,
              );
              const info = await api(
                `/projects/${projectId}/reference-info`,
                "POST",
                uploaded,
              );
              const saved = await api(
                `/projects/${projectId}/references`,
                "POST",
                {
                  path: uploaded.path,
                  label: selected.name,
                  start: 0,
                  end: info.kind === "video" ? Math.min(info.duration, 8) : 0,
                },
              );
              setRefs((ids) => [...ids, saved.id].slice(0, 5));
              await refresh();
            } catch (error: any) {
              notify(error.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          small
          disabled={!project || busy || refs.length >= 5}
          onClick={() => file.current?.click()}
        >
          Upload style reference
        </Button>
        <p className="form-hint">
          Video uploads use their first eight seconds. Use Pick parts in the
          project editor to prepare a different range before training.
        </p>
        {(project?.references || []).map((ref) => (
          <label key={ref.id}>
            <input
              type="checkbox"
              checked={refs.includes(ref.id)}
              disabled={!refs.includes(ref.id) && refs.length >= 5}
              onChange={(e) =>
                setRefs((ids) =>
                  e.target.checked
                    ? [...ids, ref.id]
                    : ids.filter((id) => id !== ref.id),
                )
              }
            />{" "}
            {ref.label} · {ref.kind}
            {ref.kind === "video"
              ? ` · ${ref.start.toFixed(2)}–${ref.end.toFixed(2)}s`
              : ""}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
          />{" "}
          Apply to this project after training
        </label>
        {!project && (
          <p>
            Create a project to own the reference media. Training does not
            create example projects.
          </p>
        )}
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button
          primary
          disabled={busy || !project || !name.trim() || !refs.length}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/projects/${projectId}/jobs`, "POST", {
                action: "train-style",
                options: {
                  name,
                  baseStyle: base,
                  direction,
                  references: refs,
                  apply,
                },
              });
              await refresh();
              notify(
                "Custom style extraction queued. Progress is available in the project editor.",
              );
              close();
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Train style
        </Button>
      </footer>
    </Modal>
  );
}

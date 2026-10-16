import { useState } from "react";
import { api, type Project } from "./types";
import {
  workflowStages,
  workflowLabel,
  projectStage,
} from "../public/lib/workflow.js";
export function ChannelBoard({
  projects,
  open,
  refresh,
  notify,
}: {
  projects: Project[];
  open: (p: Project) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [over, setOver] = useState(""),
    [busy, setBusy] = useState("");
  const move = async (id: string, stage: string) => {
    if (!projects.some((p) => p.id === id)) return;
    setBusy(id);
    try {
      await api(`/projects/${id}/kanban`, "POST", { stage });
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy("");
      setOver("");
    }
  };
  return (
    <div className="workflow-board">
      {workflowStages.map((stage) => (
        <div
          key={stage}
          className={`workflow-column ${over === stage ? "drag-over" : ""}`}
          aria-label={`${workflowLabel(stage)} column`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOver(stage);
          }}
          onDragLeave={() => setOver("")}
          onDrop={(e) => {
            e.preventDefault();
            void move(
              e.dataTransfer.getData("application/creatorize-project"),
              stage,
            );
          }}
        >
          <div className="tiny-label">
            {workflowLabel(stage)}{" "}
            <span>
              {projects.filter((p) => projectStage(p) === stage).length}
            </span>
          </div>
          {projects
            .filter((p) => projectStage(p) === stage)
            .map((p) => (
              <article
                className="kanban-card"
                key={p.id}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/creatorize-project",
                    p.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <button className="kanban-title" onClick={() => open(p)}>
                  {p.title}
                  <small>{p.shots.length} shots</small>
                </button>
                <select
                  aria-label={`Move ${p.title} to stage`}
                  value={stage}
                  disabled={busy === p.id}
                  onChange={(e) => void move(p.id, e.target.value)}
                >
                  {workflowStages.map((value) => (
                    <option key={value} value={value}>
                      {workflowLabel(value)}
                    </option>
                  ))}
                </select>
              </article>
            ))}
        </div>
      ))}
    </div>
  );
}

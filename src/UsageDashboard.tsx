import { useState } from "react";
import { type State } from "./types";
import { PageHead, Empty } from "./ui";
export function UsageDashboard({ state }: { state: State }) {
  const [project, setProject] = useState("");
  const rows = state.jobs
    .flatMap((j) =>
      (j.runs || []).map((r: any, i) => ({
        ...r,
        key: `${j.id}:${i}`,
        projectId: j.projectId,
        action: j.action,
        date: r.startedAt || j.createdAt,
      })),
    )
    .filter((r) => !project || r.projectId === project);
  const input = rows.reduce((n, r) => n + (r.usage?.input_tokens || 0), 0),
    output = rows.reduce((n, r) => n + (r.usage?.output_tokens || 0), 0);
  const cost = rows.reduce((n, r) => n + (r.estimatedCost || 0), 0),
    unknown = rows.filter((r) => r.estimatedCost == null).length;
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE USAGE"
        title="Usage & costs"
        description="Actual provider-reported tokens, with estimates using the prices you configure. Subscription equivalents are not extra charges."
      />
      <section className="panel settings-section">
        <label>
          Project
          <select
            aria-label="Usage project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All projects</option>
            {state.projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <div className="usage-totals">
          <div>
            <small>Input tokens</small>
            <strong>{input.toLocaleString()}</strong>
          </div>
          <div>
            <small>Output tokens</small>
            <strong>{output.toLocaleString()}</strong>
          </div>
          <div>
            <small>Known API equivalent</small>
            <strong>${cost.toFixed(4)}</strong>
            <small>{unknown} unpriced attempts</small>
          </div>
          <div>
            <small>Provider time</small>
            <strong>
              {(rows.reduce((n, r) => n + r.durationMs, 0) / 60000).toFixed(1)}{" "}
              min
            </strong>
          </div>
        </div>
        {rows.length ? (
          <div className="usage-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  {[
                    "Project / stage",
                    "Model",
                    "Tokens in / out",
                    "Estimate",
                    "Result / time",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      {state.projects.find((p) => p.id === r.projectId)
                        ?.title || "Workspace task"}
                      <small>
                        {r.role} · {new Date(r.date).toLocaleString()}
                      </small>
                    </td>
                    <td>
                      {r.provider} · {r.model || "Provider default"}
                      <small>{r.billing || "Billing not recorded"}</small>
                    </td>
                    <td>
                      {(r.usage?.input_tokens || 0).toLocaleString()} /{" "}
                      {(r.usage?.output_tokens || 0).toLocaleString()}
                    </td>
                    <td>
                      {r.estimatedCost == null
                        ? "Not priced"
                        : `$${r.estimatedCost.toFixed(5)}`}
                    </td>
                    <td>
                      {r.status || "done"} · {(r.durationMs / 1000).toFixed(1)}s
                      {r.error && (
                        <small title={r.error}>{r.error.slice(0, 120)}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="form-hint">
            Usage will appear after your first AI task.
          </p>
        )}
      </section>
    </>
  );
}

import { useState } from "react";
import { api, type State } from "./types";
import { Button, Badge } from "./ui";
export function ChannelCatalog({
  state,
  refresh,
  notify,
}: {
  state: State;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [url, setUrl] = useState(""),
    [dates, setDates] = useState(false),
    [limit, setLimit] = useState(5000),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const job = state.jobs.find((j) => j.action === "catalog"),
    catalog =
      state.catalogs?.find((c) => c.id === selected) || state.catalogs?.[0];
  return (
    <section className="panel settings-section">
      <h2>Public channel research</h2>
      <p>
        Read public long-form titles, thumbnails, durations and view counts from
        a channel’s Videos tab. Full metadata also attempts upload dates.
        Sources are saved locally for topic discovery and duplicate checks.
      </p>
      <div className="form-grid">
        <label>
          Public channel URL
          <input
            aria-label="Public channel URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/@channel"
          />
        </label>
        <label>
          Maximum videos
          <input
            type="number"
            min="1"
            max="5000"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={dates}
          onChange={(e) => setDates(e.target.checked)}
        />{" "}
        Fetch full upload metadata · one request per video missing a date
      </label>
      <Button
        disabled={
          busy ||
          !url.trim() ||
          ["queued", "running"].includes(job?.status || "")
        }
        onClick={async () => {
          setBusy(true);
          try {
            await api("/catalogs", "POST", {
              url,
              limit,
              dates,
              refresh: true,
            });
            await refresh();
            notify("Public channel import queued");
          } catch (e: any) {
            notify(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Fetch public channel
      </Button>
      {job && (
        <p>
          <Badge status={job.status}>{job.status}</Badge>{" "}
          {job.error || job.events.at(-1)?.text}
          {["running", "queued"].includes(job.status) && (
            <Button
              small
              onClick={async () => {
                await api(`/jobs/${job.id}/stop`, "POST");
                await refresh();
              }}
            >
              Stop import
            </Button>
          )}
        </p>
      )}
      {catalog && (
        <>
          <label>
            Saved catalogs
            <select
              aria-label="Saved public catalogs"
              value={catalog.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {state.catalogs?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {c.videos.length} videos
                </option>
              ))}
            </select>
          </label>
          <p className="form-hint">
            {catalog.source} · fetched{" "}
            {new Date(catalog.fetchedAt).toLocaleString()}
          </p>
          {catalog.warnings.map((warning: string) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          <div className="channel-catalog-list">
            {catalog.videos.map((v: any) => (
              <a href={v.url} target="_blank" rel="noreferrer" key={v.id}>
                <img src={v.thumbnail} alt="" loading="lazy" />
                <span>
                  <strong>{v.title}</strong>
                  <small>
                    {v.views == null
                      ? "Views unavailable"
                      : `${Number(v.views).toLocaleString()} views`}{" "}
                    ·{" "}
                    {v.duration == null
                      ? "Duration unavailable"
                      : `${Math.floor(v.duration / 60)}:${String(Math.round(v.duration % 60)).padStart(2, "0")}`}{" "}
                    ·{" "}
                    {v.uploadedAt
                      ? new Date(v.uploadedAt).toLocaleDateString()
                      : "Upload date unavailable"}
                  </small>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { api, type Project } from "./types";
import { Button, Modal } from "./ui";
export function TimelineEditor({
  project,
  at,
  close,
  refresh,
  notify,
}: {
  project: Project;
  at: number;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState(
      project.timeline || { cues: [], cards: [], audio: [] },
    ),
    [tab, setTab] = useState<"cues" | "cards" | "audio">("cards"),
    [assets, setAssets] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const duration = project.durationSec || project.shots.at(-1)?.end || 0;
  useEffect(() => {
    api(`/assets/${project.id}`)
      .then(setAssets)
      .catch((e) => setError(e.message));
  }, [project.id]);
  const patch = (i: number, key: string, value: any) =>
    setData((d) => ({
      ...d,
      [tab]: d[tab].map((x: any, n: number) =>
        n === i ? { ...x, [key]: value } : x,
      ),
    }));
  const add = () => {
    const start = Math.min(Math.max(0, at), Math.max(0, duration - 0.5)),
      end = Math.min(duration, start + 3),
      id = crypto.randomUUID();
    const shot =
      project.shots.find((s) => start >= s.start && start < s.end) ||
      project.shots[0];
    const item =
      tab === "cards"
        ? { id, start, end, text: "New card", fontSize: 32 }
        : tab === "audio"
          ? {
              id,
              start,
              end,
              track: "ambience",
              src: "",
              volumeDb: -20,
              offset: 0,
              fadeIn: 0.1,
              fadeOut: 0.1,
              loop: true,
            }
          : {
              id,
              time: start,
              shotId: shot?.id,
              elementId: shot?.scene?.elements[0]?.id || "",
              label: "Cue",
            };
    setData((d) => ({ ...d, [tab]: [...d[tab], item] }));
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/projects/${project.id}/timeline`, "POST", data);
      await refresh();
      notify(
        "Timeline saved. Run Sound design to rebuild any changed audio mix.",
      );
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Edit timeline" onClose={close} wide>
      <div className="modal-body form-stack">
        <div className="row">
          {(["cues", "cards", "audio"] as const).map((t) => (
            <Button key={t} primary={tab === t} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </Button>
          ))}
          <Button onClick={add} disabled={!duration}>
            Add {tab === "audio" ? "clip" : tab === "cards" ? "card" : "cue"}
          </Button>
        </div>
        <p className="form-hint">
          Times are seconds from the start of the video. Cues control when an
          element appears; cards appear over the scene. Audio clips support
          trims, fades, looping and automatic narration ducking.
        </p>
        {data[tab].map((item: any, i: number) => (
          <div className="panel timeline-item-form" key={item.id}>
            <div className="row">
              <strong>
                {tab === "cards"
                  ? item.text
                  : tab === "cues"
                    ? item.label
                    : `${item.track} clip`}
              </strong>
              <Button
                small
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    [tab]: d[tab].filter((_: any, n: number) => n !== i),
                  }))
                }
              >
                Remove
              </Button>
            </div>
            <div className="form-grid">
              {(tab === "cues" ? ["time"] : ["start", "end"]).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    min="0"
                    max={duration}
                    step="0.01"
                    value={item[k]}
                    onChange={(e) => patch(i, k, Number(e.target.value))}
                  />
                </label>
              ))}
              {tab === "cards" && (
                <>
                  <label>
                    Text
                    <input
                      value={item.text}
                      onChange={(e) => patch(i, "text", e.target.value)}
                    />
                  </label>
                  {["fontSize", "x", "y", "width", "height"].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        value={item[k] ?? ""}
                        placeholder="Automatic"
                        onChange={(e) =>
                          patch(
                            i,
                            k,
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                  ))}
                  {["fill", "background"].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="color"
                        value={
                          item[k] || (k === "fill" ? "#ffffff" : "#17231b")
                        }
                        onChange={(e) => patch(i, k, e.target.value)}
                      />
                    </label>
                  ))}
                </>
              )}
              {tab === "cues" && (
                <>
                  <label>
                    Shot
                    <select
                      value={item.shotId}
                      onChange={(e) => {
                        const shot = project.shots.find(
                          (s) => s.id === e.target.value,
                        )!;
                        setData((d) => ({
                          ...d,
                          cues: d.cues.map((c: any, n: number) =>
                            n === i
                              ? {
                                  ...c,
                                  shotId: shot.id,
                                  elementId: shot.scene?.elements[0]?.id || "",
                                  time: shot.start,
                                }
                              : c,
                          ),
                        }));
                      }}
                    >
                      {project.shots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title || s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Element
                    <select
                      value={item.elementId}
                      onChange={(e) => patch(i, "elementId", e.target.value)}
                    >
                      {project.shots
                        .find((s) => s.id === item.shotId)
                        ?.scene?.elements.map((e: any) => (
                          <option key={e.id} value={e.id}>
                            {e.id} · {e.type}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Label
                    <input
                      value={item.label}
                      onChange={(e) => patch(i, "label", e.target.value)}
                    />
                  </label>
                </>
              )}
              {tab === "audio" && (
                <>
                  <label>
                    Track
                    <select
                      value={item.track}
                      onChange={(e) => patch(i, "track", e.target.value)}
                    >
                      {["ambience", "music", "sfx"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Imported audio
                    <select
                      value={item.src}
                      onChange={(e) => patch(i, "src", e.target.value)}
                    >
                      <option value="">Choose an audio asset</option>
                      {assets
                        .filter((a) => /\.(wav|mp3|ogg|m4a)$/i.test(a.path))
                        .map((a) => (
                          <option value={a.path} key={a.path}>
                            {a.name || a.path}
                          </option>
                        ))}
                    </select>
                  </label>
                  {["volumeDb", "offset", "fadeIn", "fadeOut"].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        step="0.1"
                        value={item[k]}
                        onChange={(e) => patch(i, k, Number(e.target.value))}
                      />
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={item.loop}
                      onChange={(e) => patch(i, "loop", e.target.checked)}
                    />{" "}
                    Loop source
                  </label>
                </>
              )}
            </div>
          </div>
        ))}
        {!data[tab].length && <p>No {tab} yet. Add one at the playhead.</p>}
        {error && (
          <p className="model-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <Button onClick={close}>Cancel</Button>
        <Button primary disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save timeline"}
        </Button>
      </footer>
    </Modal>
  );
}

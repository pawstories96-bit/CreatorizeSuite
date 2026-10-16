import { useRef, useState } from "react";
import { api, media, type Project } from "./types";
import { Button, Modal } from "./ui";

export function ReferencePicker({
  project: p,
  close,
  refresh,
  notify,
  running,
}: {
  project: Project;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  running: boolean;
}) {
  const [asset, setAsset] = useState<any>(null),
    [label, setLabel] = useState(""),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [busy, setBusy] = useState(false),
    [position, setPosition] = useState(0);
  const file = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    rangePreview = useRef(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const seek = (t: number) => {
    if (video.current) video.current.currentTime = t;
    setPosition(t);
  };
  const frameTime = (t: number) => Math.round(t * asset.fps) / asset.fps;
  return (
    <Modal title="Reference techniques · Pick parts" wide onClose={close}>
      <div className="modal-body">
        <p>
          Choose a composition, camera move or visual technique. Analyzed frames
          guide original scenes in this project.
        </p>
        <input
          ref={file}
          type="file"
          hidden
          accept="video/mp4,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (!chosen) return;
            void act(async () => {
              const data = new FormData();
              data.append("file", chosen);
              const uploaded = await api(
                `/projects/${p.id}/asset`,
                "POST",
                data,
              );
              const info = await api(
                `/projects/${p.id}/reference-info`,
                "POST",
                uploaded,
              );
              setAsset(info);
              setLabel(chosen.name.replace(/\.[^.]+$/, ""));
              setStart(0);
              setEnd(info.kind === "video" ? Math.min(info.duration, 8) : 0);
              setPosition(0);
            });
            e.target.value = "";
          }}
        />
        <Button
          disabled={busy || running}
          onClick={() => file.current?.click()}
        >
          Upload reference video or image
        </Button>
        {asset && (
          <div className="reference-editor">
            {asset.kind === "video" ? (
              <>
                <video
                  ref={video}
                  controls
                  preload="metadata"
                  src={media(p, asset.path)}
                  onTimeUpdate={(e) => {
                    setPosition(e.currentTarget.currentTime);
                    if (
                      rangePreview.current &&
                      e.currentTarget.currentTime >= end
                    ) {
                      e.currentTarget.pause();
                      rangePreview.current = false;
                      e.currentTarget.currentTime = end;
                    }
                  }}
                  style={{ width: "100%", maxHeight: 360 }}
                />
                <label>
                  Scrub reference · frame {Math.round(position * asset.fps)} ·{" "}
                  {position.toFixed(3)}s
                  <input
                    aria-label="Reference position"
                    type="range"
                    min="0"
                    max={Math.max(0, asset.duration - 1 / asset.fps)}
                    step={1 / asset.fps}
                    value={position}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    In (seconds)
                    <input
                      aria-label="Reference In"
                      type="number"
                      min="0"
                      max={end}
                      step={1 / asset.fps}
                      value={start}
                      onChange={(e) =>
                        setStart(frameTime(Number(e.target.value)))
                      }
                    />
                  </label>
                  <label>
                    Out (seconds)
                    <input
                      aria-label="Reference Out"
                      type="number"
                      min={start}
                      max={asset.duration}
                      step={1 / asset.fps}
                      value={end}
                      onChange={(e) =>
                        setEnd(frameTime(Number(e.target.value)))
                      }
                    />
                  </label>
                </div>
                <div className="row">
                  <Button small onClick={() => setStart(frameTime(position))}>
                    Set In here
                  </Button>
                  <Button
                    small
                    onClick={() =>
                      setEnd(
                        Math.min(
                          asset.duration,
                          frameTime(position + 1 / asset.fps),
                        ),
                      )
                    }
                  >
                    Set Out here
                  </Button>
                  <Button
                    small
                    onClick={() => {
                      rangePreview.current = true;
                      seek(start);
                      void video.current?.play();
                    }}
                  >
                    Preview selected range
                  </Button>
                </div>
                <small className="muted">
                  {asset.fps.toFixed(3)} fps · selected{" "}
                  {Math.max(0, end - start).toFixed(3)} seconds. Out marks the
                  end of the last selected frame.
                </small>
              </>
            ) : (
              <img
                src={media(p, asset.path)}
                alt="Technique reference"
                style={{ width: "100%", maxHeight: 360, objectFit: "contain" }}
              />
            )}
            <label>
              Technique name
              <input
                aria-label="Technique name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Evidence board camera sweep"
              />
            </label>
            <Button
              primary
              disabled={
                busy ||
                running ||
                !label.trim() ||
                (asset.kind === "video" && end <= start)
              }
              onClick={() =>
                void act(async () => {
                  const ref = await api(
                    `/projects/${p.id}/references`,
                    "POST",
                    { path: asset.path, label, start, end },
                  );
                  await api(`/projects/${p.id}/jobs`, "POST", {
                    action: "analyze-reference",
                    options: { referenceId: ref.id },
                  });
                  await refresh();
                  notify(
                    "Reference saved. Selected frames are being analyzed by your reviewer model.",
                  );
                  close();
                })
              }
            >
              Save and analyze selected frames
            </Button>
          </div>
        )}
        {(p.references || []).map((ref: any) => (
          <section className="panel reference-saved" key={ref.id}>
            <div className="row spread">
              <strong>{ref.label}</strong>
              <span>
                {ref.kind === "video"
                  ? `${ref.start.toFixed(3)}–${ref.end.toFixed(3)}s`
                  : "Image"}
              </span>
            </div>
            {!!ref.frames?.length && (
              <div className="row">
                {ref.frames.map((f: any) => (
                  <img
                    key={f.path}
                    src={media(p, f.path)}
                    alt={`${ref.label} at ${f.time.toFixed(3)} seconds`}
                    style={{ width: "30%" }}
                  />
                ))}
              </div>
            )}
            {ref.analysis && (
              <details>
                <summary>Technique guidance</summary>
                {Object.entries(ref.analysis).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}: </strong>
                    {Array.isArray(value) ? value.join("; ") : String(value)}
                  </p>
                ))}
              </details>
            )}
            <div className="row">
              <Button
                small
                disabled={busy || running}
                onClick={() =>
                  void act(async () => {
                    await api(`/projects/${p.id}/jobs`, "POST", {
                      action: "analyze-reference",
                      options: { referenceId: ref.id },
                    });
                    await refresh();
                    close();
                  })
                }
              >
                {ref.analysis ? "Reanalyze" : "Analyze"}
              </Button>
              <Button
                small
                disabled={busy || running}
                onClick={() =>
                  void act(async () => {
                    await api(
                      `/projects/${p.id}/references/${ref.id}`,
                      "DELETE",
                    );
                    await refresh();
                  })
                }
              >
                Remove reference
              </Button>
            </div>
          </section>
        ))}
      </div>
      <footer>
        <Button onClick={close}>Close</Button>
      </footer>
    </Modal>
  );
}

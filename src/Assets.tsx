import { useEffect, useRef, useState } from "react";
import { Search, Upload, Image, ExternalLink, Plus } from "lucide-react";
import { api, media, type Project } from "./types";
import { Button, Modal, Empty, Badge } from "./ui";
import { MapImporter } from "./MapImporter";
export default function Assets({
  project,
  shotId,
  onClose,
  notify,
  refresh,
}: {
  project: Project;
  shotId?: string;
  onClose: () => void;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("Library"),
    [assets, setAssets] = useState<any[]>([]),
    [results, setResults] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = () => api("/assets/" + project.id).then(setAssets);
  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [project.id]);
  const act = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      await refresh();
      notify(msg);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Project assets" wide onClose={onClose}>
      <div className="modal-body">
        <div className="row spread">
          <div className="tabs">
            {["Library", "Wikimedia Commons", "3D Models", "Maps"].map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                onClick={() => {
                  setTab(t);
                  setResults([]);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <Button small onClick={() => file.current?.click()} disabled={busy}>
            <Upload size={14} />
            Import your media
          </Button>
        </div>
        {tab === "Library" &&
          ((project.baseStyle || project.style) === "3d" ||
            assets.some((a) => a.path?.endsWith(".glb"))) && (
            <section className="notice">
              <strong>
                {assets.filter((a) => a.path?.endsWith(".glb")).length} imported
                3D models ·{" "}
                {
                  project.shots.filter((s) =>
                    s.scene?.elements?.some((e: any) => e.type === "model"),
                  ).length
                }{" "}
                shots use imported models
              </strong>
              {project.production ? (
                <details>
                  <summary>
                    3D production plan · {project.production.status}
                  </summary>
                  <p>
                    {project.production.note ||
                      "Shared environments and model decisions for this video."}
                  </p>
                  {project.production.error && (
                    <p>{project.production.error}</p>
                  )}
                  {project.production.sets?.map((set: any) => (
                    <p key={set.id}>
                      <strong>{set.name}</strong> — {set.description}
                    </p>
                  ))}
                  {project.production.choices?.map((a: any) => (
                    <p key={a.key}>
                      <strong>{a.key}</strong> ·{" "}
                      {a.id ? "Catalog model" : "Bespoke geometry"}: {a.reason}
                    </p>
                  ))}
                  {project.production.shots?.map((s: any) => (
                    <p key={s.shotId}>
                      <strong>
                        {s.shotId} · {s.kind}
                      </strong>{" "}
                      — {s.focus}
                      <br />
                      Camera: {s.camera}
                      <br />
                      Action: {s.action}
                    </p>
                  ))}
                </details>
              ) : (
                <p>
                  No shared 3D production plan yet. Studio builds now plan
                  environments and retrieve models before creating shots.
                </p>
              )}
            </section>
          )}
        {tab === "Maps" && (
          <MapImporter
            project={project}
            shotId={shotId}
            refresh={refresh}
            notify={notify}
            load={load}
          />
        )}
        {tab !== "Library" && tab !== "Maps" && (
          <>
            <form
              className="asset-search"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  setResults(
                    await api(
                      (tab === "3D Models"
                        ? "/model-assets?q="
                        : "/asset-search?q=") + encodeURIComponent(query),
                    ),
                  );
                } catch (err: any) {
                  notify(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="search-field">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    tab === "3D Models"
                      ? "Search real CC0 3D props…"
                      : "Search openly licensed photos and footage…"
                  }
                />
              </div>
              <Button type="submit" disabled={busy || query.length < 2}>
                {busy ? "Searching…" : "Search"}
              </Button>
            </form>
            <p className="form-hint">
              {tab === "3D Models"
                ? "Official Kenney and Poly Haven CC0 catalogs: ships, vegetation, vehicles, environments and props. Geometry, native dimensions, source, creator and license are saved locally. Generic catalog props are not exact historical replicas."
                : "Only public-domain, CC0, CC-BY and CC-BY-SA images and footage are included. Source and attribution are saved with every download."}
            </p>
          </>
        )}
        {tab !== "Maps" && (
          <div className="asset-grid">
            {(tab === "Library" ? assets : results).map((a) => (
              <div className="asset-card" key={a.path || a.id}>
                {(tab === "3D Models" && a.preview) ||
                /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.path || a.url) ? (
                  <img
                    src={tab === "Library" ? media(project, a.path) : a.preview}
                    loading="lazy"
                  />
                ) : (
                  <div className="asset-file">
                    <Image size={24} />
                  </div>
                )}
                <div>
                  <strong>{a.name}</strong>
                  <Badge>{a.license}</Badge>
                  <small>{a.author}</small>
                  {tab === "Library" && a.path?.endsWith(".glb") && (
                    <small>
                      Used in{" "}
                      {project.shots
                        .filter((s) =>
                          s.scene?.elements?.some(
                            (e: any) => e.type === "model" && e.src === a.path,
                          ),
                        )
                        .map((s) => s.id)
                        .join(", ") || "no shots yet"}
                    </small>
                  )}
                  <div className="row">
                    {tab === "Library" ? (
                      <Button
                        small
                        disabled={
                          (!shotId && !/\.(wav|mp3|ogg|m4a)$/i.test(a.path)) ||
                          busy
                        }
                        onClick={() =>
                          act(
                            () =>
                              a.kind === "map"
                                ? api(
                                    `/projects/${project.id}/maps/apply`,
                                    "POST",
                                    { path: a.path, shotId },
                                  )
                                : api(`/projects/${project.id}/jobs`, "POST", {
                                    action: /\.(wav|mp3|ogg|m4a)$/i.test(a.path)
                                      ? "mix"
                                      : "edit",
                                    options: /\.(wav|mp3|ogg|m4a)$/i.test(
                                      a.path,
                                    )
                                      ? { ambiencePath: a.path, level: -20 }
                                      : {
                                          scope: "shot",
                                          shotId,
                                          prompt: `Use the local ${a.path.endsWith(".glb") ? "3D model" : a.path.endsWith(".mp4") ? "video" : "image"} ${a.path} in this shot. Preserve scene timing and keep the main subject readable.`,
                                        },
                                  }),
                            "Asset job queued",
                          )
                        }
                      >
                        <Plus size={12} />
                        {/\.(wav|mp3|ogg|m4a)$/i.test(a.path)
                          ? "Use as audio bed"
                          : a.kind === "map"
                            ? "Replace shot with map"
                            : "Use in shot"}
                      </Button>
                    ) : (
                      <Button
                        small
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              api(
                                tab === "3D Models"
                                  ? `/projects/${project.id}/models`
                                  : `/projects/${project.id}/assets/download`,
                                "POST",
                                a,
                              ),
                            "Asset downloaded with attribution",
                          )
                        }
                      >
                        <Plus size={12} />
                        Add to library
                      </Button>
                    )}
                    {/^https:/.test(a.source) && (
                      <a
                        className="icon-button"
                        title="View asset source"
                        href={a.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab !== "Maps" && !(tab === "Library" ? assets : results).length && (
          <Empty
            icon={Image}
            title={
              tab === "Library"
                ? "Your visual library starts here"
                : "Find the real story"
            }
            description={
              tab === "Library"
                ? "Import images you own or find openly licensed photos. Your agent can use these files in scenes."
                : "Search for a place, person, object or event on Wikimedia Commons."
            }
          />
        )}
        <input
          hidden
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,.glb,.wav,.mp3,.ogg,.m4a"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              const form = new FormData();
              form.append("file", f);
              act(
                () => api(`/projects/${project.id}/asset`, "POST", form),
                "Asset imported",
              );
            }
            e.target.value = "";
          }}
        />
      </div>
      <footer>
        <small>Attributions are stored in assets/ATTRIBUTIONS.json</small>
        <Button onClick={onClose}>Done</Button>
      </footer>
    </Modal>
  );
}

import { useEffect, useRef, useState } from "react";
import { Search, Upload, Image, ExternalLink, Plus } from "lucide-react";
import { api, media, type Project } from "./types";
import { Button, Modal, Empty, Badge } from "./ui";
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
            {["Library", "Wikimedia Commons"].map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                onClick={() => setTab(t)}
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
        {tab === "Wikimedia Commons" && (
          <>
            <form
              className="asset-search"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  setResults(
                    await api("/asset-search?q=" + encodeURIComponent(query)),
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
                  placeholder="Search openly licensed photos…"
                />
              </div>
              <Button type="submit" disabled={busy || query.length < 2}>
                {busy ? "Searching…" : "Search"}
              </Button>
            </form>
            <p className="form-hint">
              Only public-domain, CC0, CC-BY and CC-BY-SA images are included.
              Source and attribution are saved with every download.
            </p>
          </>
        )}
        <div className="asset-grid">
          {(tab === "Library" ? assets : results).map((a) => (
            <div className="asset-card" key={a.path || a.id}>
              {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.path || a.url) ? (
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
                            api(`/projects/${project.id}/jobs`, "POST", {
                              action: /\.(wav|mp3|ogg|m4a)$/i.test(a.path)
                                ? "mix"
                                : "edit",
                              options: /\.(wav|mp3|ogg|m4a)$/i.test(a.path)
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
                              `/projects/${project.id}/assets/download`,
                              "POST",
                              a,
                            ),
                          "Image downloaded with attribution",
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
        {!(tab === "Library" ? assets : results).length && (
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

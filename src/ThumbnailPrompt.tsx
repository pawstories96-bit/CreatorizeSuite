import { useEffect, useState } from "react";
import { api, media, type State } from "./types";
import { Button } from "./ui";
export function ThumbnailPrompt({
  state,
  projectId,
  refresh,
  notify,
}: {
  state: State;
  projectId: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [refs, setRefs] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [count, setCount] = useState(1),
    [key, setKey] = useState(state.settings.thumbnailStyleKey || ""),
    [rules, setRules] = useState(state.settings.thumbnailRules || "");
  useEffect(() => {
    setKey(state.settings.thumbnailStyleKey || "");
    setRules(state.settings.thumbnailRules || "");
  }, [state.settings.thumbnailStyleKey, state.settings.thumbnailRules]);
  const project = state.projects.find((p) => p.id === projectId);
  return (
    <section className="panel settings-section">
      <h2>Thumbnail prompt studio</h2>
      <label>
        Prompt
        <textarea
          aria-label="Thumbnail prompt"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the subject, story, composition, camera and light…"
        />
      </label>
      <p>
        Choose up to five image references. Their order matches @img1, @img2 and
        so on.
      </p>
      <div className="thumbnail-reference-list">
        {state.thumbnails.map((t) => {
          const p = state.projects.find((p) => p.id === t.projectId);
          return (
            p && (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={refs.includes(t.id)}
                  disabled={!refs.includes(t.id) && refs.length >= 5}
                  onChange={(e) =>
                    setRefs((ids) =>
                      e.target.checked
                        ? [...ids, t.id]
                        : ids.filter((id) => id !== t.id),
                    )
                  }
                />
                <img src={media(p, t.path)} alt={t.name} />
                {refs.includes(t.id) ? `@img${refs.indexOf(t.id) + 1} · ` : ""}
                {t.name}
              </label>
            )
          );
        })}
      </div>
      <details>
        <summary>Global style key & anti-slop rules</summary>
        <label>
          Global style key
          <textarea
            aria-label="Global thumbnail style key"
            rows={4}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label>
          Anti-slop rules
          <textarea
            aria-label="Thumbnail anti-slop rules"
            rows={3}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="No generic glow. Natural skin tones. Restrained text. Keep faces unidentifiable when required by the story."
          />
        </label>
        <Button
          small
          disabled={busy}
          onClick={async () => {
            try {
              await api("/settings", "POST", {
                thumbnailStyleKey: key,
                thumbnailRules: rules,
              });
              await refresh();
              notify("Global thumbnail direction saved");
            } catch (e: any) {
              notify(e.message);
            }
          }}
        >
          Save global direction
        </Button>
      </details>
      <div className="row">
        <label>
          Variants
          <select
            aria-label="Prompt image variants"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          primary
          disabled={busy || !project || !prompt.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/settings", "POST", {
                thumbnailStyleKey: key,
                thumbnailRules: rules,
              });
              for (let i = 0; i < count; i++) {
                await api("/thumbnails/generate", "POST", {
                  projectId,
                  prompt,
                  references: refs
                    .map((id) => state.thumbnails.find((t) => t.id === id))
                    .filter(Boolean)
                    .map((t) => ({ projectId: t.projectId, path: t.path })),
                });
                await refresh();
              }
              notify("Generated images saved in the project library");
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating…" : "Generate thumbnails"}
        </Button>
      </div>
      {!project && (
        <p className="form-hint">
          Choose a project above to save generated thumbnails.
        </p>
      )}
      <div className="thumbnail-reference-list">
        {project &&
          state.thumbnails
            .filter((t) => t.projectId === projectId)
            .slice()
            .reverse()
            .slice(0, 6)
            .map((t) => (
              <figure key={t.id}>
                <img src={media(project, t.path)} alt={t.name} />
                <figcaption>{t.model || "Imported or captured"}</figcaption>
                <Button
                  small
                  onClick={async () => {
                    try {
                      await api(`/thumbnails/${t.id}/assign`, "POST");
                      await refresh();
                      notify("Project thumbnail assigned");
                    } catch (e: any) {
                      notify(e.message);
                    }
                  }}
                >
                  Use as thumbnail
                </Button>
              </figure>
            ))}
      </div>
    </section>
  );
}

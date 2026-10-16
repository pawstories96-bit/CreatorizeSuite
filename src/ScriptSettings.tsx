import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { api, type Project } from "./types";
import { Button } from "./ui";
export type ScriptSettingsHandle = { save: () => Promise<void> };
export const ScriptSettings = forwardRef<
  ScriptSettingsHandle,
  {
    project: Project;
    disabled: boolean;
    refresh: () => Promise<void>;
    notify: (s: string) => void;
  }
>(function ScriptSettings({ project: p, disabled, refresh, notify }, ref) {
  const [mode, setMode] = useState(p.scriptSettings?.mode || "balanced"),
    [banned, setBanned] = useState((p.scriptSettings?.banned || []).join("\n")),
    [required, setRequired] = useState(
      (p.scriptSettings?.required || []).join("\n"),
    ),
    [max, setMax] = useState(p.scriptSettings?.maxSentenceWords || 30),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async () => {
    await api(`/projects/${p.id}/script-settings`, "POST", {
      mode,
      banned: banned.split("\n"),
      required: required.split("\n"),
      maxSentenceWords: max,
    });
  };
  useImperativeHandle(ref, () => ({ save }));
  return (
    <details className="scripting-settings">
      <summary>Writing mode, custom skill & script rules</summary>
      <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <label>
            Writing mode
            <select
              aria-label="Writing mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="balanced">Balanced</option>
              <option value="deep">Deep research & fact-checked</option>
              <option value="fast">Fast draft</option>
              <option value="conversational">Human & conversational</option>
            </select>
          </label>
          <label>
            Maximum words per sentence
            <input
              aria-label="Maximum words per sentence"
              type="number"
              min="3"
              max="100"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </label>
          <label>
            Banned words or phrases · one per line
            <textarea
              aria-label="Banned script phrases"
              value={banned}
              onChange={(e) => setBanned(e.target.value)}
            />
          </label>
          <label>
            Required phrases · one per line
            <textarea
              aria-label="Required script phrases"
              value={required}
              onChange={(e) => setRequired(e.target.value)}
            />
          </label>
        </div>
        <input
          ref={file}
          type="file"
          accept=".md,.txt"
          hidden
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            if (!chosen) return;
            e.target.value = "";
            setBusy(true);
            try {
              const form = new FormData();
              form.append("file", chosen);
              await api(`/projects/${p.id}/scripting-skill`, "POST", form);
              await refresh();
              notify("Scripting skill loaded for this project");
            } catch (error: any) {
              notify(error.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <div className="row">
          <Button small onClick={() => file.current?.click()}>
            Upload .md / .txt skill
          </Button>
          {p.scriptingSkill && (
            <>
              <span>{p.scriptingSkill.name}</span>
              <Button
                small
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save();
                    await api(`/projects/${p.id}/script-settings`, "POST", {
                      mode,
                      banned: banned.split("\n"),
                      required: required.split("\n"),
                      maxSentenceWords: max,
                      removeSkill: true,
                    });
                    await refresh();
                  } catch (e: any) {
                    notify(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove skill
              </Button>
            </>
          )}
        </div>
        <p className="form-hint">
          Rules are saved when you save the script or start AI writing.
          Generated narration must pass these checks before replacing the
          current script.
        </p>
      </fieldset>
    </details>
  );
});

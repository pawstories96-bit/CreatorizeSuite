import { useState } from "react";
import { api, type Project } from "./types";
import { Button, Modal } from "./ui";
export function StyleParameters({
  project: p,
  close,
  refresh,
  notify,
}: {
  project: Project;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const base = p.baseStyle || p.style,
    three = ["3d", "lowpoly"].includes(base);
  const [effects, setEffects] = useState<any>(p.styleParams?.effects || {}),
    [lighting, setLighting] = useState<any>(p.styleParams?.lighting || {}),
    [bands, setBands] = useState(
      p.styleParams?.colorBands || (p.look === "Expanded palette" ? 8 : 4),
    ),
    [busy, setBusy] = useState(false);
  const effect = (key: string, value: any) =>
    setEffects((e: any) => ({ ...e, [key]: value }));
  return (
    <Modal title="Style rendering parameters" onClose={close}>
      <div className="modal-body">
        <p>
          These controls update every shot in this project and are used by both
          the preview and video export.
        </p>
        {three && (
          <>
            <div className="form-grid">
              {["ssao", "outline", "ps1"].map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={
                      effects[key] ??
                      (key === "ssao" || key === "outline"
                        ? base === "3d"
                        : p.look === "Retro PS1")
                    }
                    onChange={(e) => effect(key, e.target.checked)}
                  />
                  {
                    {
                      ssao: "Ambient occlusion",
                      outline: "Yellow highlight outlines",
                      ps1: "PS1 vertex snapping",
                    }[key]
                  }
                </label>
              ))}
              <label>
                Bloom
                <input
                  aria-label="Style bloom"
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={effects.bloom ?? 0}
                  onChange={(e) => effect("bloom", Number(e.target.value))}
                />
              </label>
              <label>
                Film grain
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={effects.grain ?? 0}
                  onChange={(e) => effect("grain", Number(e.target.value))}
                />
              </label>
              <label>
                Ambient light
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={lighting.ambient ?? 2}
                  onChange={(e) =>
                    setLighting((v: any) => ({
                      ...v,
                      ambient: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Key light
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={lighting.key ?? 3}
                  onChange={(e) =>
                    setLighting((v: any) => ({
                      ...v,
                      key: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </>
        )}
        {base === "pixel" && (
          <label>
            Color bands per channel · {bands}
            <input
              aria-label="Pixel color bands"
              type="range"
              min="2"
              max="16"
              step="1"
              value={bands}
              onChange={(e) => setBands(Number(e.target.value))}
            />
          </label>
        )}
        {!three && (
          <label>
            <input
              type="checkbox"
              checked={effects.halftone ?? base === "collage"}
              onChange={(e) => effect("halftone", e.target.checked)}
            />{" "}
            Paper halftone overlay
          </label>
        )}
      </div>
      <footer>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/projects/${p.id}`, "PATCH", { styleParams: {} });
              await refresh();
              close();
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Use scene defaults
        </Button>
        <Button
          primary
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/projects/${p.id}`, "PATCH", {
                styleParams: {
                  effects,
                  ...(three && Object.keys(lighting).length
                    ? {
                        lighting: {
                          ambient: 2,
                          key: 3,
                          position: { x: 8, y: 16, z: 10 },
                          ...lighting,
                        },
                      }
                    : {}),
                  ...(base === "pixel" ? { colorBands: bands } : {}),
                },
              });
              await refresh();
              close();
              notify("Project rendering parameters saved");
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Apply to project
        </Button>
      </footer>
    </Modal>
  );
}

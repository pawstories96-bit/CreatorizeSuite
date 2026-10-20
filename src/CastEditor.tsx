import { useEffect, useRef, useState } from "react";
import { api, type Project } from "./types";
import { Modal, Button } from "./ui";
import {
  castRoles,
  castNames as roleNames,
  defaultCast,
} from "../public/lib/cast.js";
import { cameraMoves } from "../public/lib/cameras.js";
const castNames: Record<string, string> = roleNames;
const motions = [
  "idle",
  "walk",
  "run",
  "sit",
  "sit-down",
  "stand-up",
  "point",
  "wave",
  "talk",
  "phone",
  "carry",
  "reach",
  "crouch",
  "celebrate",
  "fall",
];
export function CastEditor({
  project: p,
  shotId,
  close,
  refresh,
  notify,
}: {
  project: Project;
  shotId?: string;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [cast, setCast] = useState<any>({ ...defaultCast, ...p.cast }),
    [castMode, setCastMode] = useState(p.castMode || "mixamo"),
    [characterModels, setCharacterModels] = useState<any>(
      p.characterModels || {},
    ),
    [role, setRole] = useState("main"),
    [pose, setPose] = useState("idle"),
    [importedMotion, setImportedMotion] = useState(""),
    [motionLibrary, setMotionLibrary] = useState<any[]>(p.motions || []),
    [prop, setProp] = useState(""),
    [hand, setHand] = useState("right"),
    [camera, setCamera] = useState("push-in"),
    [assets, setAssets] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [importStatus, setImportStatus] = useState(""),
    [previewReady, setPreviewReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null),
    file = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    filePurpose = useRef("custom"),
    motionFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api(`/assets/${p.id}`)
      .then(setAssets)
      .catch((e) => notify(e.message));
  }, [p.id]);
  const preview = () => {
    if (!previewReady) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: "project",
        project: {
          ...p,
          style: "3d",
          baseStyle: undefined,
          styleParams: {},
          format: "16:9",
          cast,
          castMode,
          characterModels,
          words: [],
          timeline: {},
          audio: null,
          sourceVideo: null,
          shots: [
            {
              id: "cast-preview",
              start: 0,
              end: 6,
              scene: {
                background: "#202a31",
                camera: { x: 2.1, y: 1.6, z: 3.3 },
                cameraRig: {
                  type: "dolly",
                  target: { x: 0, y: 0.95, z: 0 },
                  duration: 6,
                },
                lighting: { ambient: 1.5, key: 3 },
                elements: [
                  {
                    id: "person",
                    type: "mannequin",
                    height: 1.8,
                    width: 0.5,
                    x: 0,
                    y: 0,
                    z: 0,
                    scale: 1,
                    opacity: 1,
                    fill: "#eff0ef",
                    body: "male",
                    finish: "matte",
                    role: "neutral",
                    castRole: role,
                    pose,
                    duration: 2,
                    delay: 0,
                    motionSpeed: 1,
                    ...(importedMotion
                      ? { motionSrc: importedMotion, loop: true }
                      : {}),
                    ...(prop ? { heldProp: { kind: prop, hand } } : {}),
                  },
                  {
                    id: "floor",
                    type: "box",
                    x: 0,
                    y: -0.08,
                    z: 0,
                    width: 8,
                    height: 0.16,
                    depth: 8,
                    fill: "#42494f",
                    opacity: 1,
                    scale: 1,
                  },
                ],
              },
            },
          ],
        },
      },
      location.origin,
    );
  };
  useEffect(preview, [
    cast,
    role,
    pose,
    prop,
    hand,
    previewReady,
    importedMotion,
    castMode,
    characterModels,
  ]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin === location.origin &&
        e.source === frame.current?.contentWindow &&
        e.data.type === "ready"
      )
        setPreviewReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const set = (r: string, key: string, value: any) =>
    setCast((all: any) => ({
      ...all,
      [r]: { ...all[r], [key]: value || undefined },
    }));
  const act = async (fn: () => Promise<any>, message: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      notify(message);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Cast & motion" wide onClose={close}>
      <div className="modal-body">
        <p>
          Each role keeps its body, finish and color throughout the video. Apply
          changes to update existing shots and exports without rebuilding
          scenes.
        </p>
        <label>
          Character source
          <select
            aria-label="Character source"
            value={castMode}
            onChange={(e) => setCastMode(e.target.value)}
          >
            <option value="mixamo">Mixamo characters</option>
            <option value="procedural">Procedural fallback</option>
          </select>
        </label>
        {castMode === "mixamo" && (
          <div className="notice">
            <p>
              Download your male and female characters from{" "}
              <a
                href="https://www.mixamo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Mixamo
              </a>
              , then import their FBX files here. Use With Skin for characters;
              animation-only files can use Without Skin. Imported meshes keep
              their skeletons and use the project’s actions, motion library,
              colors and finishes.
            </p>
            <p className="form-hint">
              Body slots are reused for new projects in this workspace. Import a
              folder to add every character to this project; X Bot and Y Bot
              fill the female and male slots when present.
            </p>
            <Button
              small
              disabled={busy}
              onClick={() => folder.current?.click()}
            >
              Import Mixamo folder
            </Button>
            <input
              ref={folder}
              type="file"
              hidden
              multiple
              {...{ webkitdirectory: "" }}
              aria-label="Mixamo character folder"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).filter((f) =>
                  /\.(fbx|glb)$/i.test(f.name),
                );
                e.target.value = "";
                if (!files.length) return;
                setBusy(true);
                let imported = 0;
                const failures: string[] = [];
                for (const f of files) {
                  setImportStatus(
                    `Importing ${f.name} (${imported + failures.length + 1}/${files.length})`,
                  );
                  try {
                    const form = new FormData();
                    form.append("file", f);
                    form.append("kind", "character");
                    form.append("source", "mixamo");
                    const stem = f.name
                        .replace(/\.(fbx|glb)$/i, "")
                        .replace(/[ _-]/g, "")
                        .toLowerCase(),
                      body =
                        stem === "xbot"
                          ? "female"
                          : stem === "ybot"
                            ? "male"
                            : null;
                    if (body) form.append("body", body);
                    const asset = await api(
                      `/projects/${p.id}/rig-import`,
                      "POST",
                      form,
                    );
                    if (body)
                      setCharacterModels((all: any) => ({
                        ...all,
                        [body]: asset,
                      }));
                    imported++;
                  } catch (error: any) {
                    failures.push(`${f.name}: ${error.message}`);
                  }
                }
                try {
                  setAssets(await api(`/assets/${p.id}`));
                  await refresh();
                } finally {
                  setBusy(false);
                }
                setCastMode("mixamo");
                setImportStatus(
                  `${imported}/${files.length} characters imported.${failures.length ? " " + failures.join("; ") : " Apply the cast to use them."}`,
                );
              }}
            />
            {importStatus && <p role="status">{importStatus}</p>}
            <div className="form-grid">
              {["male", "female"].map((body) => (
                <div key={body}>
                  <strong>
                    {body === "male" ? "Male body" : "Female body"}
                  </strong>
                  <p>{characterModels[body]?.name || "Not imported"}</p>
                  <Button
                    small
                    disabled={busy}
                    onClick={() => {
                      filePurpose.current = body;
                      file.current?.click();
                    }}
                  >
                    Import {body} Mixamo character
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="cast-editor-grid">
          <div className="table-wrap">
            <table className="cast-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Body</th>
                  <th>Finish</th>
                  <th>Color</th>
                </tr>
              </thead>
              <tbody>
                {castRoles.map((r) => (
                  <tr
                    key={r}
                    className={r === role ? "selected" : ""}
                    onClick={() => setRole(r)}
                  >
                    <td>
                      <button onClick={() => setRole(r)}>{castNames[r]}</button>
                    </td>
                    <td>
                      <select
                        aria-label={`${castNames[r]} body`}
                        value={cast[r].body}
                        onChange={(e) => set(r, "body", e.target.value)}
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`${castNames[r]} finish`}
                        value={cast[r].finish}
                        onChange={(e) => set(r, "finish", e.target.value)}
                      >
                        {["matte", "glossy", "glow"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${castNames[r]} color`}
                        type="color"
                        value={cast[r].color}
                        onChange={(e) => set(r, "color", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <iframe
              ref={frame}
              title="Live 3D cast preview"
              className="character-preview"
              src="/player.html?castPreview=1&width=640&height=360"
            />
            <div className="form-grid">
              <label>
                Preview action
                <select
                  aria-label="Preview action"
                  value={pose}
                  onChange={(e) => setPose(e.target.value)}
                >
                  {motions.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Hold a prop
                <select
                  aria-label="Hold a prop"
                  value={prop}
                  onChange={(e) => setProp(e.target.value)}
                >
                  <option value="">Empty hands</option>
                  {[
                    "phone",
                    "scanner",
                    "cup",
                    "paper",
                    "briefcase",
                    "bag",
                    "staff",
                    "bat",
                  ].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Grip
                <select value={hand} onChange={(e) => setHand(e.target.value)}>
                  {["left", "right", "both"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {castNames[role]} model
              <select
                aria-label="Cast model"
                value={cast[role].src || ""}
                onChange={(e) => {
                  set(role, "src", e.target.value);
                  set(
                    role,
                    "humanoid",
                    !!assets.find((a) => a.path === e.target.value)?.humanoid,
                  );
                }}
              >
                <option value="">
                  {castMode === "mixamo"
                    ? `Mixamo ${cast[role].body} body`
                    : "Procedural mannequin"}
                </option>
                {assets
                  .filter((a) => a.path.endsWith(".glb"))
                  .map((a) => (
                    <option key={a.path} value={a.path}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              small
              disabled={busy}
              onClick={() => {
                filePurpose.current = "custom";
                file.current?.click();
              }}
            >
              Import character FBX / GLB
            </Button>
            <input
              ref={file}
              type="file"
              accept=".glb,.fbx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                act(async () => {
                  const form = new FormData();
                  form.append("file", f);
                  form.append("kind", "character");
                  if (filePurpose.current !== "custom") {
                    form.append("body", filePurpose.current);
                    form.append("source", "mixamo");
                  }
                  const asset = await api(
                    `/projects/${p.id}/rig-import`,
                    "POST",
                    form,
                  );
                  setAssets(await api(`/assets/${p.id}`));
                  if (filePurpose.current === "custom") {
                    set(role, "src", asset.path);
                    set(role, "humanoid", false);
                  } else {
                    setCharacterModels((all: any) => ({
                      ...all,
                      [filePurpose.current]: asset,
                    }));
                    setCastMode("mixamo");
                  }
                }, "Character imported; apply the cast to use it");
                e.target.value = "";
              }}
            />
            <p className="form-hint">
              Mixamo body slots use the imported skin with humanoid actions and
              hand props. A custom model override retains its own embedded
              clips. Folder-imported Mixamo characters also support humanoid
              actions when selected as a role’s model. All models are fitted to
              the actor’s requested height. FBX / GLB limit: 150 MB per file.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Imported humanoid motion
            <select
              aria-label="Imported humanoid motion"
              value={importedMotion}
              onChange={(e) => setImportedMotion(e.target.value)}
            >
              <option value="">Use built-in action</option>
              {motionLibrary.map((m) => (
                <option key={m.path} value={m.path}>
                  {m.name} · {m.duration?.toFixed(1)}s
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy} onClick={() => motionFile.current?.click()}>
            Import animation FBX / GLB
          </Button>
          <input
            ref={motionFile}
            hidden
            type="file"
            accept=".fbx,.glb"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              act(async () => {
                const form = new FormData();
                form.append("file", f);
                form.append("kind", "motion");
                const record = await api(
                  `/projects/${p.id}/rig-import`,
                  "POST",
                  form,
                );
                setMotionLibrary((all) => [
                  ...all.filter((m) => m.path !== record.path),
                  record,
                ]);
                setImportedMotion(record.path);
              }, "Humanoid motion imported and added to this project");
              e.target.value = "";
            }}
          />
        </div>
        <p className="form-hint">
          Animation imports map standard humanoid limb names to Mixamo and
          procedural bodies. Inspect the live preview before using a new motion.
          Character files must embed their textures; unsupported skeletons show
          a mapping error.
        </p>
        {shotId && (
          <div className="form-grid">
            <Button
              disabled={busy || (!!cast[role].src && !cast[role].humanoid)}
              onClick={() =>
                act(
                  () =>
                    api(`/projects/${p.id}/actor-action`, "POST", {
                      shotId,
                      role,
                      pose,
                      heldProp: prop ? { kind: prop, hand } : null,
                      motionSrc: importedMotion || null,
                    }),
                  "Character action applied; available in History",
                )
              }
            >
              Apply action to {castNames[role]} in this shot
            </Button>
            <label>
              Camera move for the current shot
              <select
                aria-label="Camera move"
                value={camera}
                onChange={(e) => setCamera(e.target.value)}
              >
                {cameraMoves.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api(`/projects/${p.id}/camera`, "POST", {
                      shotId,
                      preset: camera,
                    }),
                  "Camera move applied; available in History",
                )
              }
            >
              Apply camera move
            </Button>
          </div>
        )}
      </div>
      <footer>
        <Button onClick={close}>Close</Button>
        <Button
          primary
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api(`/projects/${p.id}`, "PATCH", { cast, castMode });
              close();
            }, "Cast updated across every shot")
          }
        >
          Apply cast to project
        </Button>
      </footer>
    </Modal>
  );
}

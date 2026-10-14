import { useEffect, useRef, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type NodeProps,
} from "@xyflow/react";
import { Plus, Sparkles, Image, Type, Save, Download } from "lucide-react";
import { api, media, type State } from "./types";
import { Button } from "./ui";

function Card({ id, data, selected }: NodeProps) {
  const d = data as any;
  return (
    <div className={`board-card ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        {d.kind === "image" ? (
          <Image size={15} />
        ) : d.kind === "prompt" ? (
          <Sparkles size={15} />
        ) : (
          <Type size={15} />
        )}
        <strong>{d.label}</strong>
      </header>
      {d.kind === "image" ? (
        <>
          <img src={d.url} draggable={false} />
          <small>{d.text}</small>
        </>
      ) : (
        <textarea
          className="nodrag nowheel"
          placeholder={
            d.kind === "prompt"
              ? "Describe the thumbnail. Connect images as references."
              : "Add direction, title or notes…"
          }
          value={d.text || ""}
          onChange={(e) => d.change(id, e.target.value)}
        />
      )}
      {d.kind === "prompt" && (
        <Button small disabled={d.busy} onClick={() => d.generate(id)}>
          <Sparkles size={13} />
          {d.busy ? "Generating…" : "Generate image"}
        </Button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { card: Card };
export function ThumbnailBoard({
  projectId,
  state,
  refresh,
  notify,
}: {
  projectId: string;
  state: State;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const boardId = projectId || "master";
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]),
    [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [saving, setSaving] = useState(false),
    [count, setCount] = useState(1),
    [busy, setBusy] = useState(""),
    [imageId, setImageId] = useState("");
  const current = useRef({ nodes, edges });
  current.current = { nodes, edges };
  const loaded = useRef("");
  useEffect(() => {
    if (!state.workspace || loaded.current === boardId) return;
    const b = state.boards.find((b) => b.id === boardId);
    setNodes(b?.nodes || []);
    setEdges(b?.edges || []);
    loaded.current = boardId;
  }, [boardId, state.boards, state.workspace]);
  const persist = async () => {
    setSaving(true);
    try {
      await api("/boards", "POST", {
        id: boardId,
        projectId: projectId || null,
        ...current.current,
      });
      await refresh();
      notify("Canvas saved");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  };
  const change = useCallback(
    (id: string, text: string) =>
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)),
      ),
    [],
  );
  const add = (kind: string, extra: any = {}) =>
    setNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: "card",
        position: {
          x: 60 + (ns.length % 3) * 340,
          y: 50 + Math.floor(ns.length / 3) * 330,
        },
        data: {
          kind,
          label:
            kind === "image"
              ? "Image reference"
              : kind === "prompt"
                ? "Image prompt"
                : "Direction",
          text: "",
          ...extra,
        },
      },
    ]);
  const generate = async (id: string) => {
    const { nodes, edges } = current.current,
      n = nodes.find((n) => n.id === id),
      incoming = edges
        .filter((e) => e.target === id)
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter(Boolean);
    const p =
      projectId || incoming.find((n) => n.data.projectId)?.data.projectId;
    if (!p) return notify("Choose a project to save the generated image.");
    if (!n?.data.text?.trim()) return notify("Write an image prompt first.");
    setBusy(id);
    try {
      for (let variant = 0; variant < count; variant++) {
        const t = await api("/thumbnails/generate", "POST", {
          projectId: p,
          prompt: [
            n.data.text,
            ...incoming
              .filter((n) => n.data.kind !== "image")
              .map((n) => n.data.text),
          ].join("\n"),
          references: incoming
            .filter((n) => n.data.kind === "image")
            .map((n) => ({ projectId: n.data.projectId, path: n.data.path })),
        });
        const project = state.projects.find((p) => p.id === t.projectId)!;
        const outputId = crypto.randomUUID();
        setNodes((ns) => [
          ...ns,
          {
            id: outputId,
            type: "card",
            position: {
              x: n.position.x + 350,
              y: n.position.y + variant * 330,
            },
            data: {
              kind: "image",
              label: "Generated image",
              text: t.name,
              url: media(project, t.path),
              projectId: t.projectId,
              path: t.path,
            },
          },
        ]);
        setEdges((es) => [
          ...es,
          { id: crypto.randomUUID(), source: id, target: outputId },
        ]);
        await refresh();
      }
      notify("Image generated. Save the canvas to keep its layout.");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };
  const addImage = () => {
    const t = state.thumbnails.find((t) => t.id === imageId);
    if (!t) return;
    const p = state.projects.find((p) => p.id === t.projectId);
    if (p)
      add("image", {
        text: t.name,
        url: media(p, t.path),
        projectId: p.id,
        path: t.path,
      });
  };
  const exportBoard = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.current, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "thumbnail-canvas.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="panel thumbnail-board">
      <div className="row board-toolbar">
        <select
          aria-label="Image variants"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n} image{n > 1 ? "s" : ""} per prompt
            </option>
          ))}
        </select>
        <Button small onClick={() => add("prompt")}>
          <Plus size={14} />
          Prompt
        </Button>
        <Button small onClick={() => add("text")}>
          <Type size={14} />
          Text
        </Button>
        <select value={imageId} onChange={(e) => setImageId(e.target.value)}>
          <option value="">Choose a library image</option>
          {state.thumbnails
            .filter((t) => !projectId || t.projectId === projectId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <Button small disabled={!imageId} onClick={addImage}>
          <Image size={14} />
          Add image
        </Button>
        <span className="spacer" />
        <Button small onClick={exportBoard}>
          <Download size={14} />
          JSON
        </Button>
        <Button primary small disabled={saving} onClick={persist}>
          <Save size={14} />
          {saving ? "Saving…" : "Save canvas"}
        </Button>
      </div>
      <div className="board-surface">
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            data: { ...n.data, change, generate, busy: busy === n.id },
          }))}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c) => setEdges((es) => addEdge(c, es))}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={2}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={24} />
          <Controls />
          <MiniMap />
        </ReactFlow>
        {!nodes.length && (
          <div className="board-hint">
            Your canvas starts here.
            <small>
              Add prompts, text and images. Drag between handles to connect
              references.
            </small>
          </div>
        )}
      </div>
      <small className="board-footer">
        {projectId ? "Project canvas" : "Master canvas"} · Drag to arrange ·
        Scroll to zoom · Select + Delete to remove · Save keeps your layout
      </small>
    </div>
  );
}

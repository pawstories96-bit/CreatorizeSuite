import crypto from "node:crypto";
export async function comfyModels(base) {
  const r = await fetch(
    base.replace(/\/$/, "") + "/object_info/CheckpointLoaderSimple",
    { signal: AbortSignal.timeout(10000) },
  );
  if (!r.ok) throw Error(`ComfyUI returned ${r.status}`);
  const data = await r.json();
  return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
}
export function defaultWorkflow({
  prompt,
  model,
  seed,
  width = 1280,
  height = 720,
  reference,
}) {
  const graph = {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: model } },
    2: {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["1", 1] },
    },
    3: {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, unreadable text, watermark", clip: ["1", 1] },
    },
    4: {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    5: {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 25,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: reference ? 0.7 : 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: reference ? ["8", 0] : ["4", 0],
      },
    },
    6: {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    7: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "Framecraft", images: ["6", 0] },
    },
  };
  if (reference) {
    graph["9"] = { class_type: "LoadImage", inputs: { image: reference } };
    graph["8"] = {
      class_type: "VAEEncode",
      inputs: { pixels: ["9", 0], vae: ["1", 2] },
    };
  }
  return graph;
}
export async function generateComfy({
  settings,
  prompt,
  references = [],
  signal,
}) {
  const base = (settings.comfyUrl || "http://127.0.0.1:8188").replace(
    /\/$/,
    "",
  );
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15 * 60_000)]);
  const model = settings.comfyModel;
  if (!model) throw Error("Choose an installed ComfyUI checkpoint in Settings");
  const seed = crypto.randomInt(0, 2 ** 48 - 1);
  let reference;
  if (references.length > 1 && !settings.comfyWorkflow)
    throw Error(
      "The standard ComfyUI workflow accepts one reference. Use a custom API workflow for multiple references.",
    );
  const uploaded = [];
  for (const ref of references) {
    const body = new FormData();
    body.append(
      "image",
      new Blob([ref.bytes], { type: ref.mime }),
      `framecraft-${crypto.randomUUID()}.${ref.mime === "image/jpeg" ? "jpg" : ref.mime === "image/webp" ? "webp" : "png"}`,
    );
    const r = await fetch(base + "/upload/image", {
      method: "POST",
      body,
      signal,
    });
    if (!r.ok) throw Error("ComfyUI reference upload failed");
    const data = await r.json();
    uploaded.push(
      data.subfolder ? data.subfolder + "/" + data.name : data.name,
    );
  }
  reference = uploaded[0];
  let graph = defaultWorkflow({ prompt, model, seed, reference });
  if (settings.comfyWorkflow) {
    graph = JSON.parse(settings.comfyWorkflow);
    const replace = (value) =>
      typeof value === "string"
        ? value
            .replaceAll("{{prompt}}", prompt)
            .replaceAll("{{model}}", model)
            .replace(/\{\{reference:(\d+)\}\}/g, (_, i) => {
              if (!uploaded[i])
                throw Error("Custom workflow needs a missing reference image");
              return uploaded[i];
            })
        : Array.isArray(value)
          ? value.map(replace)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, replace(v)]),
              )
            : value;
    graph = replace(graph);
    for (const node of Object.values(graph))
      if (node.inputs?.seed != null) node.inputs.seed = seed;
  }
  const response = await fetch(base + "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: crypto.randomUUID() }),
    signal,
  });
  const queued = await response.json();
  if (!response.ok || !queued.prompt_id)
    throw Error(
      `ComfyUI rejected the workflow: ${JSON.stringify(queued.error || queued.node_errors || queued).slice(0, 1000)}`,
    );
  const deadline = Date.now() + 15 * 60_000;
  try {
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const r = await fetch(
        base + "/history/" + encodeURIComponent(queued.prompt_id),
        {
          signal: AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!r.ok) throw Error(`ComfyUI history returned ${r.status}`);
      const data = (await r.json())[queued.prompt_id];
      if (data?.status?.status_str === "error")
        throw Error(
          `ComfyUI failed: ${JSON.stringify(data.status.messages).slice(0, 1200)}`,
        );
      const output = Object.values(data?.outputs || {})
        .flatMap((o) => o.images || [])
        .find((i) => i.type === "output");
      if (output) {
        const image = await fetch(
          base + "/view?" + new URLSearchParams(output),
          { signal },
        );
        if (!image.ok) throw Error("ComfyUI output download failed");
        return {
          bytes: Buffer.from(await image.arrayBuffer()),
          seed,
          model,
          promptId: queued.prompt_id,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw Error("ComfyUI generation timed out after 15 minutes");
  } catch (error) {
    await fetch(base + "/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [queued.prompt_id] }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
    throw error;
  }
}

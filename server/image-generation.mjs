import fs from "node:fs";
import path from "node:path";
import { uid, atomic, safePath } from "./core.mjs";
import { generateComfy } from "./comfy.mjs";
import { generateCloudImage, validImage } from "./cloud-images.mjs";

export async function generateImage({
  store,
  vault,
  project: p,
  prompt,
  references = [],
  parentId = null,
  purpose = "thumbnail",
  signal,
}) {
  const s = store.settings(),
    channel = store.get("channels", p.channelId);
  if (!Array.isArray(references) || references.length > 8)
    throw Error("Use up to eight image references");
  prompt = [
    String(prompt || ""),
    purpose === "thumbnail" ? s.thumbnailStyleKey : "",
    purpose === "thumbnail" ? channel?.thumbnailStyleKey : "",
    purpose === "thumbnail" ? s.thumbnailRules : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!prompt.trim() || prompt.length > 50000)
    throw Error("Enter an image prompt up to 50,000 characters");
  const refs = references.map((ref) => {
    store.project(ref.projectId);
    const file = safePath(store.projectDir(ref.projectId), ref.path),
      ext = path.extname(file).toLowerCase();
    const mime = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[ext];
    if (!mime || !fs.existsSync(file) || !/^(assets|exports)\//.test(ref.path))
      throw Error(
        "Reference must be an existing project PNG, JPEG or WebP image",
      );
    return { bytes: fs.readFileSync(file), mime, name: path.basename(file) };
  });
  let bytes, details;
  if (s.imageProvider === "comfy") {
    const result = await generateComfy({
      settings: s,
      prompt,
      references: refs,
      signal,
    });
    bytes = result.bytes;
    details = {
      provider: "comfy",
      model: result.model,
      seed: result.seed,
      promptId: result.promptId,
    };
  } else if (["fal", "higgsfield"].includes(s.imageProvider)) {
    ({ bytes, details } = await generateCloudImage({
      store,
      vault,
      project: p,
      settings: s,
      prompt,
      references: refs,
      portrait: purpose === "concept" && p.format === "9:16",
      purpose,
      parentId,
      signal,
    }));
  } else if (s.imageProvider === "flow") {
    if (!store.flowBridge)
      throw Error("Google Flow browser bridge is unavailable");
    ({ bytes, details } = await store.flowBridge.generate({
      project: p,
      prompt,
      references: refs,
      purpose,
      signal,
    }));
  } else {
    const key = (await vault.get("imageKey")) || (await vault.get("apiKey"));
    if (!key) throw Error("Add an image provider key in Connections");
    if (!s.imageModel || !s.imageUrl)
      throw Error("Set your image generation model and endpoint in Settings");
    const endpoint = refs.length ? s.imageEditUrl : s.imageUrl;
    if (!endpoint)
      throw Error(
        "Set the image edit endpoint in Settings to generate with reference images",
      );
    const url = new URL(endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error(
        "Use an HTTP(S) image endpoint without credentials in its URL",
      );
    const headers = { Authorization: `Bearer ${key}` },
      size =
        purpose === "concept" && p.format === "9:16"
          ? "1024x1536"
          : "1536x1024";
    let body;
    if (refs.length) {
      body = new FormData();
      body.append("model", s.imageModel);
      body.append("prompt", prompt);
      body.append("size", size);
      for (const ref of refs)
        body.append(
          "image[]",
          new Blob([ref.bytes], { type: ref.mime }),
          ref.name,
        );
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ model: s.imageModel, prompt, n: 1, size });
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: signal || AbortSignal.timeout(600000),
    });
    if (!response.ok) {
      let detail;
      try {
        detail = (await response.json()).error?.message;
      } catch {}
      throw Error(
        `Image provider ${response.status}: ${String(
          detail || response.statusText,
        )
          .replaceAll(key, "[redacted]")
          .slice(0, 500)}`,
      );
    }
    const data = await response.json();
    if (data.data?.[0]?.b64_json)
      bytes = Buffer.from(data.data[0].b64_json, "base64");
    else if (data.data?.[0]?.url) {
      const imageUrl = new URL(data.data[0].url);
      if (
        imageUrl.protocol !== "https:" ||
        imageUrl.username ||
        imageUrl.password
      )
        throw Error("Provider image URL must use HTTPS");
      const image = await fetch(imageUrl, {
        redirect: "error",
        signal: signal || AbortSignal.timeout(60000),
      });
      if (!image.ok) throw Error("Could not retrieve generated image");
      bytes = Buffer.from(await image.arrayBuffer());
    } else throw Error("Image endpoint did not return an image");
    details = { provider: "api", model: s.imageModel };
  }
  const extension = validImage(bytes);
  const relative = `assets/${purpose}-${uid()}.${extension}`;
  atomic(path.join(store.projectDir(p.id), relative), bytes);
  const record = {
    id: uid(),
    name: p.title,
    projectId: p.id,
    path: relative,
    prompt,
    ...details,
    parentId,
    purpose,
    styleKey:
      purpose === "thumbnail"
        ? [s.thumbnailStyleKey, channel?.thumbnailStyleKey]
            .filter(Boolean)
            .join("\n")
        : "",
    createdAt: new Date().toISOString(),
  };
  return store.put(purpose === "thumbnail" ? "thumbnails" : "concepts", record);
}

import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { uid } from "./core.mjs";

// Only these documented API origins receive provider credentials. Media URLs
// and presigned uploads never receive the API Authorization header.
const origins = {
  fal: "https://queue.fal.run",
  higgsfield: "https://api.higgsfield.ai",
};
export function mediaURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error(
      "Provider media must use an HTTPS URL without embedded credentials",
    );
  return url;
}
export function validImage(bytes) {
  if (!bytes?.length || bytes.length > 50 * 1024 * 1024)
    throw Error("Generated image is empty or exceeds 50 MB");
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216) return "jpg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw Error("Image provider output is not a PNG, JPEG or WebP image");
}
export function requestURL(provider, value) {
  const url = mediaURL(value);
  if (url.origin !== origins[provider])
    throw Error("Provider returned an unexpected request origin");
  return url;
}
export async function imageBytes(value, { signal, fetcher = fetch } = {}) {
  if (String(value).startsWith("data:image/")) {
    const match =
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match || match[1].length > 70 * 1024 * 1024)
      throw Error("Invalid provider image data");
    return Buffer.from(match[1], "base64");
  }
  const response = await fetcher(mediaURL(value), {
    redirect: "error",
    signal,
  });
  if (!response.ok)
    throw Error(`Could not retrieve generated image (${response.status})`);
  if (Number(response.headers.get("content-length")) > 50 * 1024 * 1024)
    throw Error("Generated image exceeds 50 MB");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 50 * 1024 * 1024) throw Error("Generated image exceeds 50 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(url, { key, ...options } = {}, fetcher = fetch) {
  const response = await fetcher(url, {
    ...options,
    redirect: "error",
    headers: {
      ...(key ? { Authorization: `Key ${key}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  if (text.length > 16 * 1024 * 1024)
    throw Error("Image provider response is too large");
  let data;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!response.ok)
    throw Error(
      `Image provider ${response.status}: ${String(
        data?.detail ||
          data?.error?.message ||
          data?.error ||
          response.statusText,
      )
        .replaceAll(key || "\u0000", "[redacted]")
        .slice(0, 500)}`,
    );
  if (!data) throw Error("Image provider returned invalid JSON");
  return data;
}
function resolve(doc, value, depth = 0) {
  if (depth > 12) throw Error("Image schema has circular references");
  if (value?.$ref) {
    if (!value.$ref.startsWith("#/"))
      throw Error("External image schema references are unsupported");
    const target = value.$ref
      .slice(2)
      .split("/")
      .reduce(
        (o, k) => o?.[k.replaceAll("~1", "/").replaceAll("~0", "~")],
        doc,
      );
    return resolve(doc, target, depth + 1);
  }
  if (value?.allOf)
    return value.allOf.reduce((a, v) => {
      const b = resolve(doc, v, depth + 1);
      return {
        ...a,
        ...b,
        properties: { ...a.properties, ...b.properties },
        required: [...(a.required || []), ...(b.required || [])],
      };
    }, {});
  if (!value) return {};
  return {
    ...value,
    ...(value.anyOf
      ? { anyOf: value.anyOf.map((v) => resolve(doc, v, depth + 1)) }
      : {}),
    ...(value.oneOf
      ? { oneOf: value.oneOf.map((v) => resolve(doc, v, depth + 1)) }
      : {}),
  };
}
export function inputSchema(doc, model) {
  const operation = doc.paths?.["/" + model]?.post;
  if (!operation)
    throw Error("The live schema does not advertise this model endpoint");
  const schema = resolve(
    doc,
    operation.requestBody?.content?.["application/json"]?.schema,
  );
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties || {}).map(([k, v]) => [
        k,
        resolve(doc, v),
      ]),
    ),
  };
}
export async function imageCatalog(
  provider,
  {
    query = "",
    category = "text-to-image",
    cursor = "",
    model = "",
    fetcher = fetch,
  } = {},
) {
  const signal = AbortSignal.timeout(30000);
  if (provider === "fal") {
    const url = new URL("https://api.fal.ai/v1/models");
    if (model) {
      url.searchParams.set("endpoint_id", model);
      url.searchParams.set("expand", "openapi-3.0");
    } else {
      url.searchParams.set(
        "category",
        category === "image-to-image" ? category : "text-to-image",
      );
      url.searchParams.set("status", "active");
      url.searchParams.set("limit", "50");
      if (query) url.searchParams.set("q", query.slice(0, 200));
      if (cursor) url.searchParams.set("cursor", cursor.slice(0, 300));
    }
    const data = await json(url, { signal }, fetcher);
    return {
      provider,
      models: (data.models || []).map((m) => ({
        id: m.endpoint_id,
        name: m.metadata?.display_name || m.endpoint_id,
        description: m.metadata?.description || "",
        category: m.metadata?.category,
        ...(m.openapi ? { schema: inputSchema(m.openapi, m.endpoint_id) } : {}),
      })),
      nextCursor: data.has_more ? data.next_cursor : null,
      source: "Live fal model catalog",
    };
  }
  if (provider === "higgsfield") {
    const doc = await json(
        "https://docs.higgsfield.ai/docs/openapi.json",
        { signal },
        fetcher,
      ),
      models = [];
    for (const [route, value] of Object.entries(doc.paths || {})) {
      if (!value.post || route.includes("{")) continue;
      const schema = inputSchema(doc, route.slice(1));
      // This supplementary public schema contains both video and image models.
      if (
        !schema.properties?.prompt ||
        schema.properties.duration ||
        schema.properties.video_url ||
        schema.properties.audio_url
      )
        continue;
      if (model && route !== "/" + model) continue;
      if (
        !model &&
        category === "image-to-image" &&
        !["image_url", "image_urls", "reference_image_urls"].some(
          (k) => schema.properties[k],
        )
      )
        continue;
      if (
        query &&
        !`${route} ${value.post.summary}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        continue;
      models.push({
        id: route.slice(1),
        name: value.post.summary?.replace(/^Create /i, "") || route.slice(1),
        description: value.post.description || "",
        schema,
      });
    }
    return {
      provider,
      models,
      nextCursor: null,
      source:
        "Higgsfield public API schema (partial catalog; the console may offer more models)",
    };
  }
  throw Error("Choose fal or Higgsfield to fetch an image catalog");
}
const alternatives = (p) => [p, ...(p.anyOf || []), ...(p.oneOf || [])];
function accepts(p, value) {
  return alternatives(p).some((s) => {
    if (s.enum) return s.enum.includes(value);
    return s.type === "string"
      ? typeof value === "string" &&
          value.length >= (s.minLength ?? 0) &&
          value.length <= (s.maxLength ?? Infinity)
      : s.type === "integer"
        ? Number.isInteger(value) &&
          value >= (s.minimum ?? -Infinity) &&
          value <= (s.maximum ?? Infinity)
        : s.type === "number"
          ? typeof value === "number" &&
            Number.isFinite(value) &&
            value >= (s.minimum ?? -Infinity) &&
            value <= (s.maximum ?? Infinity)
          : s.type === "boolean"
            ? typeof value === "boolean"
            : s.type === "array"
              ? Array.isArray(value) &&
                value.length >= (s.minItems ?? 0) &&
                value.length <= (s.maxItems ?? Infinity) &&
                (!s.items?.type || value.every((v) => accepts(s.items, v)))
              : s.type === "object"
                ? !!value &&
                  typeof value === "object" &&
                  !Array.isArray(value) &&
                  (s.required || []).every((k) => k in value) &&
                  Object.entries(value).every(([k, v]) =>
                    s.properties?.[k]
                      ? accepts(s.properties[k], v)
                      : s.additionalProperties !== false,
                  )
                : false;
  });
}
export function imageInput(
  schema,
  { prompt, referenceURLs = [], portrait = false, parameters = {} },
) {
  const props = schema.properties || {},
    input = {};
  if (!props.prompt)
    throw Error("Selected model does not advertise a text prompt");
  for (const [key, value] of Object.entries(parameters)) {
    if (
      [
        "prompt",
        "image_url",
        "image_urls",
        "reference_image_urls",
        "images",
      ].includes(key)
    )
      throw Error("Prompt and references are supplied by the project");
    if (!props[key] || !accepts(props[key], value))
      throw Error(`Unsupported image parameter: ${key}`);
    input[key] = value;
  }
  if (!accepts(props.prompt, prompt))
    throw Error("Prompt exceeds the selected model's length limits");
  input.prompt = prompt;
  if (referenceURLs.length) {
    const field = ["image_urls", "reference_image_urls", "image_url"].find(
      (k) => props[k],
    );
    if (!field)
      throw Error(
        "This model does not accept references. Select an image-to-image model.",
      );
    if (field === "image_url" && referenceURLs.length > 1)
      throw Error("This model accepts one reference image");
    input[field] = field === "image_url" ? referenceURLs[0] : referenceURLs;
    if (!accepts(props[field], input[field]))
      throw Error("Reference count exceeds the selected model's limits");
  }
  const ratio = portrait ? "9:16" : "16:9";
  if (
    props.aspect_ratio &&
    !Object.hasOwn(input, "aspect_ratio") &&
    accepts(props.aspect_ratio, ratio)
  )
    input.aspect_ratio = ratio;
  if (
    props.image_size &&
    !Object.hasOwn(input, "image_size") &&
    accepts(props.image_size, portrait ? "portrait_16_9" : "landscape_16_9")
  )
    input.image_size = portrait ? "portrait_16_9" : "landscape_16_9";
  if (
    props.image_size &&
    !Object.hasOwn(input, "image_size") &&
    accepts(props.image_size, {
      width: portrait ? 768 : 1344,
      height: portrait ? 1344 : 768,
    })
  )
    input.image_size = {
      width: portrait ? 768 : 1344,
      height: portrait ? 1344 : 768,
    };
  if (props.num_images && !Object.hasOwn(input, "num_images"))
    input.num_images = 1;
  for (const key of schema.required || [])
    if (!(key in input) && props[key]?.default == null)
      throw Error(
        `This model requires “${key}”. Add it under model parameters.`,
      );
  return input;
}
export async function generateCloudImage({
  store,
  vault,
  project,
  settings,
  prompt,
  references,
  portrait,
  purpose,
  parentId,
  signal,
  fetcher = fetch,
  pollMs = 1500,
}) {
  const provider = settings.imageProvider,
    model =
      settings[provider + (references.length ? "EditModel" : "Model")] ||
      settings[provider + "Model"];
  if (!origins[provider] || !/^[\w.-]+(?:\/[\w.-]+)+$/.test(model || ""))
    throw Error("Fetch and select an image model in Settings");
  const key = await vault.get(provider + "Key");
  if (!key)
    throw Error(
      `Add your ${provider === "fal" ? "fal" : "Higgsfield key ID:secret"} API key in Connections`,
    );
  signal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(600000)])
    : AbortSignal.timeout(600000);
  const catalog = await imageCatalog(provider, { model, fetcher }),
    schema = catalog.models.find((m) => m.id === model)?.schema;
  if (!schema)
    throw Error("Selected model is absent from the provider's live schema");
  // Validate capabilities before uploading any reference media.
  const parameters = settings[provider + "Parameters"] || {};
  imageInput(schema, {
    prompt,
    referenceURLs: references.map(
      () => "https://example.invalid/reference.png",
    ),
    portrait,
    parameters,
  });
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        provider,
        model,
        project: project.id,
        purpose,
        parentId,
        prompt,
        parameters,
        portrait,
        refs: references.map((r) =>
          crypto.createHash("sha256").update(r.bytes).digest("hex"),
        ),
      }),
    )
    .digest("hex");
  let record = store
    .all("imageRequests")
    .find(
      (r) =>
        r.fingerprint === fingerprint &&
        !["completed", "cancelled", "failed"].includes(r.status),
    );
  if (!record) {
    const urls = [];
    for (const ref of references) {
      if (provider === "fal")
        urls.push(`data:${ref.mime};base64,${ref.bytes.toString("base64")}`);
      else {
        const upload = await json(
          origins.higgsfield + "/files/generate-upload-url",
          {
            key,
            method: "POST",
            body: JSON.stringify({ content_type: ref.mime }),
            signal,
          },
          fetcher,
        );
        const response = await fetcher(mediaURL(upload.upload_url), {
          method: "PUT",
          headers: upload.upload_headers || { "Content-Type": ref.mime },
          body: ref.bytes,
          signal,
          redirect: "error",
        });
        if (!response.ok)
          throw Error(`Reference upload failed (${response.status})`);
        urls.push(mediaURL(upload.public_url).href);
      }
    }
    const input = imageInput(schema, {
      prompt,
      referenceURLs: urls,
      portrait,
      parameters,
    });
    const submitted = await json(
      origins[provider] + "/" + model,
      { key, method: "POST", body: JSON.stringify(input), signal },
      fetcher,
    );
    if (!submitted.request_id)
      throw Error("Image provider did not return a request ID");
    const root =
      provider === "higgsfield"
        ? `${origins[provider]}/requests/${encodeURIComponent(submitted.request_id)}`
        : null;
    record = store.put("imageRequests", {
      id: uid(),
      projectId: project.id,
      fingerprint,
      provider,
      model,
      requestId: submitted.request_id,
      status: "pending",
      statusURL: requestURL(provider, submitted.status_url || root + "/status")
        .href,
      resultURL:
        provider === "fal"
          ? requestURL(provider, submitted.response_url).href
          : null,
      cancelURL: requestURL(provider, submitted.cancel_url || root + "/cancel")
        .href,
      createdAt: new Date().toISOString(),
    });
  }
  try {
    let result;
    for (;;) {
      signal.throwIfAborted();
      const status = await json(
        requestURL(provider, record.statusURL),
        { key, signal },
        fetcher,
      );
      if (
        ["failed", "nsfw", "canceled", "cancelled", "FAILED"].includes(
          status.status,
        )
      ) {
        record.status = "failed";
        store.put("imageRequests", record);
        throw Error(
          `Image generation ${status.status}: ${String(
            status.error || "No image was returned",
          )
            .replaceAll(key, "[redacted]")
            .slice(0, 500)}`,
        );
      }
      if (["completed", "COMPLETED"].includes(status.status)) {
        result =
          provider === "fal"
            ? await json(
                requestURL(provider, record.resultURL),
                { key, signal },
                fetcher,
              )
            : status;
        break;
      }
      if (
        !["queued", "in_progress", "IN_QUEUE", "IN_PROGRESS"].includes(
          status.status,
        )
      )
        throw Error("Image provider returned an unrecognized request state");
      await delay(pollMs, undefined, { signal });
    }
    const url = result.images?.[0]?.url || result.image?.url;
    if (!url) throw Error("Image request completed without an image");
    const bytes = await imageBytes(url, { signal, fetcher });
    validImage(bytes);
    record.status = "completed";
    record.completedAt = new Date().toISOString();
    store.put("imageRequests", record);
    return {
      bytes,
      details: {
        provider,
        model,
        requestId: record.requestId,
        seed: result.seed,
      },
    };
  } catch (error) {
    if (signal.aborted) {
      const cancelled = await fetcher(requestURL(provider, record.cancelURL), {
        method: provider === "fal" ? "PUT" : "POST",
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }).catch(() => null);
      if (cancelled?.status === 202) record.status = "cancelled";
      // An in-progress request can reject cancellation. Keep its ID so retrying
      // retrieves the original result instead of buying a duplicate generation.
      store.put("imageRequests", record);
    }
    throw error;
  }
}

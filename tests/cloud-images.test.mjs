import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Store, uid } from "../server/core.mjs";
import {
  imageCatalog,
  imageInput,
  generateCloudImage,
  requestURL,
} from "../server/cloud-images.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGJkAAAAASUVORK5CYII=",
  "base64",
);
const schema = {
  type: "object",
  properties: {
    prompt: { type: "string", minLength: 3, maxLength: 500 },
    image_urls: { type: "array", items: { type: "string" }, maxItems: 2 },
    aspect_ratio: {
      anyOf: [{ type: "string", enum: ["16:9", "9:16"] }, { type: "null" }],
    },
    num_images: { type: "integer", minimum: 1, maximum: 4 },
  },
  required: ["prompt"],
};
const doc = {
  paths: {
    "/test/image": {
      post: {
        summary: "Create Image",
        requestBody: { content: { "application/json": { schema } } },
      },
    },
  },
};
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("image models come from live schemas; invalid parameters and incompatible references fail before submission", async () => {
  const data = await imageCatalog("higgsfield", {
    fetcher: async () => response(doc),
  });
  assert.equal(data.models[0].id, "test/image");
  assert.match(data.source, /partial catalog/);
  assert.equal(
    imageInput(schema, { prompt: "A real bridge", portrait: true })
      .aspect_ratio,
    "9:16",
  );
  assert.throws(() => imageInput(schema, { prompt: "x" }), /length/);
  assert.throws(
    () =>
      imageInput(schema, { prompt: "Bridge", parameters: { num_images: 9 } }),
    /Unsupported/,
  );
  assert.throws(
    () =>
      imageInput(
        { properties: { prompt: { type: "string" } } },
        { prompt: "Bridge", referenceURLs: ["https://media.test/ref"] },
      ),
    /does not accept/,
  );
  assert.throws(
    () => requestURL("fal", "https://foreign.test/status"),
    /unexpected request origin/,
  );
});
test("fal catalog aliases use the canonical endpoint advertised by their schema", async () => {
  const aliasDoc = {
    ...doc,
    info: { "x-fal-metadata": { endpointId: "test/image" } },
  };
  const result = await imageCatalog("fal", {
    model: "brand/new-image",
    fetcher: async () =>
      response({
        models: [{ endpoint_id: "brand/new-image", openapi: aliasDoc }],
      }),
  });
  assert.equal(result.models[0].id, "brand/new-image");
  assert.equal(result.models[0].endpoint, "test/image");
  assert.equal(result.models[0].schema.properties.prompt.minLength, 3);
});
test("fal resumes a pending paid request, downloads an actual image, and keeps credentials off the media request", async () => {
  const store = await new Store().init(
      path.resolve(".test-cloud-fal-" + uid()),
    ),
    project = await store.create({ title: "Internal image request" });
  let submits = 0,
    interrupted = true,
    polls = 0;
  const fetcher = async (value, options = {}) => {
    const url = new URL(value);
    if (url.hostname === "api.fal.ai")
      return response({
        models: [
          {
            endpoint_id: "test/image",
            metadata: { display_name: "Test image" },
            openapi: doc,
          },
        ],
      });
    if (url.hostname === "media.test") {
      assert.equal(options.headers, undefined);
      return new Response(png);
    }
    assert.equal(options.headers.Authorization, "Key test-secret");
    if (options.method === "POST") {
      submits++;
      const root = "https://queue.fal.run/test/image/requests/one";
      return response({
        request_id: "one",
        status_url: root + "/status",
        response_url: root,
        cancel_url: root + "/cancel",
      });
    }
    if (url.pathname.endsWith("/status")) {
      polls++;
      if (interrupted) throw Error("Connection interrupted");
      return response({ status: "COMPLETED" });
    }
    return response({
      images: [{ url: "https://media.test/image.png" }],
      seed: 42,
    });
  };
  const input = {
    store,
    project,
    vault: { get: async () => "test-secret" },
    settings: { imageProvider: "fal", falModel: "test/image" },
    prompt: "A real bridge",
    references: [{ bytes: png, mime: "image/png" }],
    purpose: "thumbnail",
    fetcher,
    pollMs: 1,
  };
  await assert.rejects(generateCloudImage(input), /interrupted/);
  interrupted = false;
  const result = await generateCloudImage(input);
  assert.deepEqual(result.bytes, png);
  assert.equal(result.details.seed, 42);
  assert.equal(submits, 1);
  assert.equal(polls, 2);
  assert.equal(store.all("imageRequests")[0].status, "completed");
  assert.ok(
    !JSON.stringify(store.all("imageRequests")).includes("test-secret"),
  );
});
test("Higgsfield uploads references with signed storage headers, polls completion and does not leak the API key", async () => {
  const store = await new Store().init(
      path.resolve(".test-cloud-higgsfield-" + uid()),
    ),
    project = await store.create({ title: "Internal reference generation" });
  const fetcher = async (value, options = {}) => {
    const url = new URL(value);
    if (url.hostname === "docs.higgsfield.ai") return response(doc);
    if (url.hostname === "storage.test") {
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers["x-amz-tagging"], "retention=temporary");
      assert.deepEqual(options.body, png);
      return new Response(null, { status: 200 });
    }
    if (url.hostname === "media.test") {
      assert.equal(options.headers, undefined);
      return new Response(png);
    }
    assert.equal(options.headers.Authorization, "Key test-id:test-secret");
    if (url.pathname.includes("generate-upload-url"))
      return response({
        upload_url: "https://storage.test/upload",
        public_url: "https://media.test/reference.png",
        upload_headers: {
          "Content-Type": "image/png",
          "x-amz-tagging": "retention=temporary",
        },
      });
    if (url.pathname === "/test/image") {
      const input = JSON.parse(options.body);
      assert.deepEqual(input.image_urls, ["https://media.test/reference.png"]);
      assert.equal(input.aspect_ratio, "9:16");
      return response({ request_id: "two" });
    }
    return response({
      status: "completed",
      images: [{ url: "https://media.test/result.png" }],
    });
  };
  const result = await generateCloudImage({
    store,
    project,
    vault: { get: async () => "test-id:test-secret" },
    settings: { imageProvider: "higgsfield", higgsfieldModel: "test/image" },
    prompt: "A textured ship",
    references: [{ bytes: png, mime: "image/png" }],
    portrait: true,
    purpose: "concept",
    fetcher,
    pollMs: 1,
  });
  assert.deepEqual(result.bytes, png);
  assert.equal(result.details.provider, "higgsfield");
});
test("cancellation that a running provider refuses preserves the request ID for safe retrieval", async () => {
  const store = await new Store().init(
      path.resolve(".test-cloud-cancel-" + uid()),
    ),
    project = await store.create({ title: "Internal cancellation" });
  const controller = new AbortController();
  let submitted = 0,
    finished = false;
  const fetcher = async (value, options = {}) => {
    const url = new URL(value);
    if (url.hostname === "api.fal.ai")
      return response({
        models: [{ endpoint_id: "test/image", openapi: doc }],
      });
    if (url.hostname === "media.test") return new Response(png);
    if (options.method === "POST") {
      submitted++;
      const root = "https://queue.fal.run/test/image/requests/three";
      return response({
        request_id: "three",
        status_url: root + "/status",
        response_url: root,
        cancel_url: root + "/cancel",
      });
    }
    if (options.method === "PUT") return response({}, 400);
    if (url.pathname.endsWith("/status")) {
      if (!finished) setTimeout(() => controller.abort(), 5);
      return response({ status: finished ? "COMPLETED" : "IN_PROGRESS" });
    }
    return response({ images: [{ url: "https://media.test/result.png" }] });
  };
  const args = {
    store,
    project,
    vault: { get: async () => "secret" },
    settings: { imageProvider: "fal", falModel: "test/image" },
    prompt: "Ship concept",
    references: [],
    purpose: "concept",
    fetcher,
    pollMs: 100,
  };
  await assert.rejects(
    generateCloudImage({ ...args, signal: controller.signal }),
    /abort/i,
  );
  assert.equal(store.all("imageRequests")[0].status, "pending");
  finished = true;
  await generateCloudImage(args);
  assert.equal(submitted, 1);
});

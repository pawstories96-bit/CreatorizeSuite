import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store, uid, atomic } from "../server/core.mjs";
import { transferUpload } from "../server/youtube-upload.mjs";
test("upload resumes after interruption by querying server acknowledged bytes, without reuploading completed chunks", async () => {
  const root = path.resolve(".test-upload-" + uid()),
    store = await new Store().init(root),
    p = await store.create({ title: "Protocol test only" }),
    file = path.join(store.projectDir(p.id), "exports", "test.mp4");
  atomic(file, Buffer.alloc(10 * 1024 * 1024));
  const stat = fs.statSync(file),
    record = {
      id: uid(),
      projectId: p.id,
      path: "exports/test.mp4",
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      location: "https://www.googleapis.com/upload/test",
      offset: 0,
      status: "uploading",
    };
  const original = globalThis.fetch;
  let calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push(options.headers["Content-Range"]);
      if (calls.length === 1)
        return new Response(null, {
          status: 308,
          headers: { Range: "bytes=0-8388607" },
        });
      throw Error("Network interrupted");
    };
    await assert.rejects(
      () => transferUpload(store, async () => "test-token", record),
      /Network interrupted/,
    );
    assert.equal(store.get("uploads", record.id).offset, 8388608);
    const restarted = await new Store().init(root),
      saved = restarted.get("uploads", record.id);
    calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(options.headers["Content-Range"]);
      return calls.length === 1
        ? new Response(null, {
            status: 308,
            headers: { Range: "bytes=0-8388607" },
          })
        : new Response(JSON.stringify({ id: "test-video" }), { status: 200 });
    };
    const result = await transferUpload(
      restarted,
      async () => "test-token",
      saved,
      true,
    );
    assert.equal(result.id, "test-video");
    assert.deepEqual(calls, [
      "bytes */10485760",
      "bytes 8388608-10485759/10485760",
    ]);
    assert.equal(restarted.get("uploads", saved.id).status, "done");
  } finally {
    globalThis.fetch = original;
  }
});

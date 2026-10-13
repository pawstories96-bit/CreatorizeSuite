import fs from "node:fs";
import { safePath } from "./core.mjs";
const active = new Map();
export function cancelUploads(root) {
  for (const item of active.values())
    if (item.root === root) item.controller.abort();
}
export async function transferUpload(store, token, record, resume = false) {
  if (active.has(record.id)) throw Error("This upload is already running");
  if (record.status === "done") return { id: record.videoId };
  const endpoint = new URL(record.location);
  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname.endsWith(".googleapis.com")
  )
    throw Error("Invalid Google upload session");
  const file = safePath(store.projectDir(record.projectId), record.path),
    stat = fs.statSync(file);
  if (stat.size !== record.size || stat.mtimeMs !== record.mtimeMs) {
    record.status = "expired";
    store.put("uploads", record);
    throw Error(
      "The exported video changed. Create a new upload for the new file.",
    );
  }
  const controller = new AbortController();
  active.set(record.id, { root: store.root, controller });
  record.status = "uploading";
  record.error = null;
  store.put("uploads", record);
  const handle = fs.openSync(file, "r");
  const request = async (body, range) =>
    fetch(record.location, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Length": String(body.length),
        "Content-Type": "video/mp4",
        "Content-Range": range,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
    });
  const offsetOf = (r) => {
    const range = r.headers.get("range");
    if (!range) return 0;
    const match = /bytes=0-(\d+)/i.exec(range);
    if (!match) throw Error("YouTube returned an invalid received range");
    return Number(match[1]) + 1;
  };
  let result;
  try {
    if (resume) {
      const r = await request(Buffer.alloc(0), `bytes */${record.size}`);
      if (r.status === 308) record.offset = offsetOf(r);
      else if (r.ok) result = await r.json();
      else if ([404, 410].includes(r.status)) {
        record.status = "expired";
        throw Error("The upload session expired. Start a new upload.");
      } else throw Error(`Could not resume upload: ${r.status}`);
      store.put("uploads", record);
    }
    while (!result && record.offset < record.size) {
      const offset = record.offset,
        length = Math.min(8 * 1024 * 1024, record.size - offset),
        chunk = Buffer.alloc(length);
      fs.readSync(handle, chunk, 0, length, offset);
      const r = await request(
        chunk,
        `bytes ${offset}-${offset + length - 1}/${record.size}`,
      );
      if (r.status === 308) {
        const next = offsetOf(r);
        if (next <= offset || next > record.size)
          throw Error("YouTube did not acknowledge the uploaded chunk");
        record.offset = next;
        store.put("uploads", record);
      } else if (r.ok) result = await r.json();
      else
        throw Error(
          `Upload failed ${r.status}: ${(await r.text()).slice(0, 400)}`,
        );
    }
    if (!result?.id)
      throw Error("YouTube did not confirm the completed upload");
    record.status = "done";
    record.offset = record.size;
    record.videoId = result.id;
    store.put("uploads", record);
    return result;
  } catch (e) {
    if (record.status !== "expired") record.status = "error";
    record.error = e.message;
    store.put("uploads", record);
    throw e;
  } finally {
    fs.closeSync(handle);
    active.delete(record.id);
  }
}

import http from "node:http";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  generateComfy,
  comfyModels,
  defaultWorkflow,
} from "../server/comfy.mjs";
import { synthesizeSpeech } from "../server/speech.mjs";
import { uid, run } from "../server/core.mjs";
import { publicDownload } from "../server/research.mjs";
process.env.PATH =
  path.resolve("resources/ffmpeg") + path.delimiter + process.env.PATH;
const root = path.resolve(".test-adapters-" + uid());
fs.mkdirSync(root, { recursive: true });
await run("ffmpeg", [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=0.2",
  path.join(root, "source.wav"),
]);
let posted;
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (req.url.startsWith("/object_info"))
    return json({
      CheckpointLoaderSimple: {
        input: {
          required: { ckpt_name: [["installed-checkpoint.safetensors"]] },
        },
      },
    });
  if (req.url === "/prompt") {
    posted = JSON.parse(body);
    return json({ prompt_id: "run-one" });
  }
  if (req.url === "/history/run-one")
    return json({
      "run-one": {
        status: { status_str: "success" },
        outputs: {
          7: {
            images: [{ filename: "frame.png", type: "output", subfolder: "" }],
          },
        },
      },
    });
  if (req.url.startsWith("/view")) {
    res.setHeader("Content-Type", "image/png");
    return res.end(Buffer.from("89504e470d0a1a0a", "hex"));
  }
  if (req.url === "/v1/audio/speech") {
    const input = JSON.parse(body);
    assert.equal(input.voice, "chosen-voice");
    assert.equal(input.input, "Speech adapter test");
    res.setHeader("Content-Type", "audio/wav");
    return res.end(fs.readFileSync(path.join(root, "source.wav")));
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.deepEqual(await comfyModels(base), [
    "installed-checkpoint.safetensors",
  ]);
  const image = await generateComfy({
    settings: {
      comfyUrl: base,
      comfyModel: "installed-checkpoint.safetensors",
    },
    prompt: 'A "quoted" prompt',
  });
  assert.equal(image.promptId, "run-one");
  assert.equal(posted.prompt["2"].inputs.text, 'A "quoted" prompt');
  assert.equal(
    posted.prompt["1"].inputs.ckpt_name,
    "installed-checkpoint.safetensors",
  );
  assert.equal(
    defaultWorkflow({
      prompt: "test",
      model: "m",
      seed: 1,
      reference: "ref.png",
    })["5"].inputs.latent_image[0],
    "8",
  );
  await synthesizeSpeech({
    provider: "kokoro",
    text: "Speech adapter test",
    voice: "chosen-voice",
    output: path.join(root, "out.wav"),
    settings: { kokoroUrl: base + "/v1" },
    vault: {},
    job: {},
  });
  assert.ok(fs.statSync(path.join(root, "out.wav")).size > 1000);
  await assert.rejects(publicDownload(base), /private or local/);
  console.log(
    "PASS: ComfyUI discovery/queue/history/output protocol, reference graph, Kokoro HTTP speech with real WAV decoding, research private-network protection",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

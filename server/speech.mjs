import fs from "node:fs";
import path from "node:path";
import { run, atomic } from "./core.mjs";
export async function synthesizeSpeech({
  provider,
  text,
  voice,
  output,
  settings,
  vault,
  job,
}) {
  if (provider === "piper") {
    const model = settings.piperModel;
    if (!model || !fs.existsSync(model) || !fs.existsSync(model + ".json"))
      throw Error(
        "Set a Piper .onnx voice and its .onnx.json configuration in Settings",
      );
    await run(
      settings.piperExecutable || "piper",
      [
        "--model",
        model,
        "--output_file",
        output,
        ...(voice ? ["--speaker", voice] : []),
      ],
      {
        input: text,
        timeout: 1800000,
        onChild: (c) => (job.abort = () => c.kill()),
      },
    );
    if (!fs.existsSync(output)) throw Error("Piper did not produce a WAV file");
    return;
  }
  if (!["fish", "kokoro"].includes(provider))
    throw Error("Unknown speech adapter");
  const key = provider === "fish" ? await vault.get("fish") : null;
  if (provider === "fish" && !key)
    throw Error("Add your Fish Audio key in Connections");
  const selected = voice || settings[`${provider}Voice`];
  if (!selected) throw Error(`Choose a ${provider} voice ID`);
  const controller = new AbortController();
  job.abort = () => controller.abort();
  const response = await fetch(
    provider === "fish"
      ? "https://api.fish.audio/v1/tts"
      : (settings.kokoroUrl || "http://127.0.0.1:8880/v1").replace(/\/$/, "") +
          "/audio/speech",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(provider === "fish" && settings.fishModel
          ? { model: settings.fishModel }
          : {}),
      },
      body: JSON.stringify(
        provider === "fish"
          ? { text, reference_id: selected, format: "wav" }
          : {
              model: settings.kokoroModel || "kokoro",
              input: text,
              voice: selected,
              response_format: "wav",
              speed: 1,
            },
      ),
    },
  );
  if (!response.ok)
    throw Error(
      `${provider} ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const tmp = path.join(path.dirname(output), `${provider}.response.wav`);
  atomic(tmp, Buffer.from(await response.arrayBuffer()));
  try {
    await run("ffmpeg", ["-y", "-i", tmp, "-ac", "1", "-ar", "44100", output], {
      timeout: 600000,
      onChild: (c) => (job.abort = () => c.kill()),
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

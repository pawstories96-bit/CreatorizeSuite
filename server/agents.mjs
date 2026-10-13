import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { run, uid, atomic } from "./core.mjs";

export function extractJSON(text) {
  const clean = text
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const a = clean.indexOf("{"),
      b = clean.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1));
    throw Error(
      "The provider did not return valid JSON. Retry or choose a stronger model.",
    );
  }
}
export function cliPath(name) {
  if (process.platform === "win32") {
    if (name === "claude") {
      const p = path.join(os.homedir(), ".local", "bin", "claude.exe");
      if (fs.existsSync(p)) return p;
    }
    if (name === "codex") {
      const base = path.join(
        os.homedir(),
        "AppData",
        "Local",
        "OpenAI",
        "Codex",
        "bin",
      );
      if (fs.existsSync(base)) {
        const list = fs
          .readdirSync(base)
          .map((n) => path.join(base, n, "codex.exe"))
          .filter(fs.existsSync)
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        if (list.length) return list[0];
      }
    }
  }
  return name;
}
export class AgentRunner {
  constructor(store, vault) {
    this.store = store;
    this.vault = vault;
  }
  async detect() {
    return Promise.all(
      ["codex", "claude", "local"].map(async (id) => {
        try {
          if (id === "local") {
            const s = this.store.settings();
            const r = await fetch(s.localUrl.replace(/\/$/, "") + "/models", {
              signal: AbortSignal.timeout(4000),
            });
            if (!r.ok) throw Error("Local endpoint is not responding");
            const j = await r.json();
            return {
              id,
              installed: true,
              signedIn: true,
              version: s.localUrl,
              models: j.data?.map((x) => x.id) || [],
              billing: "local",
            };
          }
          const exe = cliPath(id);
          const version = (
            await run(exe, ["--version"], { timeout: 10000 })
          ).stdout.trim();
          let auth;
          try {
            const result = await run(
              exe,
              id === "codex" ? ["login", "status"] : ["auth", "status"],
              { timeout: 10000 },
            );
            auth = result.stdout + result.stderr;
          } catch {
            return { id, installed: true, signedIn: false, version };
          }
          return {
            id,
            installed: true,
            signedIn: /logged in|"loggedIn"\s*:\s*true/i.test(auth),
            version,
            billing: "subscription",
            models: [],
          };
        } catch (e) {
          return {
            id,
            installed: false,
            signedIn: false,
            error: e.message,
            models: [],
          };
        }
      }),
    );
  }
  async generate({ prompt, cwd, job, emit, role = "build", images = [] }) {
    const s = this.store.settings();
    const route = {
      ...(s.roles?.[role] ||
        (role === "research" ? s.roles?.script : null) ||
        {}),
      ...job.options?.agent,
    };
    const provider = route.provider || s.provider,
      model = route.model || s.model;
    const previousUsage = { ...job.usage };
    const started = Date.now();
    job.usage = {};
    job.provider = provider;
    emit("info", `Using ${provider}${model ? " · " + model : ""}`);
    let text = "";
    if (provider === "local" || provider === "api") {
      const url = (
        provider === "local"
          ? s.localUrl
          : s.apiUrl || "https://api.openai.com/v1"
      ).replace(/\/$/, "");
      const key = provider === "api" ? await this.vault.get("apiKey") : null;
      if (provider === "api" && !key)
        throw Error("Add your API key in Connections");
      const controller = new AbortController();
      job.abort = () => controller.abort();
      const response = await fetch(url + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: route.model || (provider === "local" ? s.localModel : s.model),
          messages: [
            {
              role: "system",
              content:
                "Return the requested JSON only. Follow the supplied schema and constraints.",
            },
            {
              role: "user",
              content: images?.length
                ? [
                    { type: "text", text: prompt },
                    ...images.map((file) => ({
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`,
                      },
                    })),
                  ]
                : prompt,
            },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) job.limitHit = true;
        throw Error(
          `Provider ${response.status}: ${(await response.text()).slice(0, 500)}`,
        );
      }
      const data = await response.json();
      text = data.choices?.[0]?.message?.content || "";
      job.usage = data.usage || {};
      emit("usage", JSON.stringify(job.usage));
    } else {
      const output = path.join(cwd, `.response-${uid()}.json`);
      let buffer = "";
      const args =
        provider === "codex"
          ? [
              "exec",
              "--json",
              "--sandbox",
              "read-only",
              "--skip-git-repo-check",
              "--ephemeral",
              "-c",
              `model_reasoning_effort=${JSON.stringify(route.effort || s.effort || "medium")}`,
              ...(role === "research" ? ["-c", 'web_search="live"'] : []),
              "-o",
              output,
              ...(model ? ["--model", model] : []),
              ...images.flatMap((p) => ["--image", p]),
              "-",
            ]
          : [
              "-p",
              "--output-format",
              "stream-json",
              "--verbose",
              "--tools",
              role === "research" ? "WebSearch,WebFetch" : "",
              ...(role === "research"
                ? ["--allowedTools", "WebSearch,WebFetch"]
                : []),
              "--no-session-persistence",
              ...(model ? ["--model", model] : []),
            ];
      try {
        const result = await run(cliPath(provider), args, {
          cwd,
          input: prompt,
          timeout: role === "test" ? 60000 : 1800000,
          onChild: (child) => {
            job.abort = () => {
              if (process.platform === "win32")
                run("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(
                  () => {},
                );
              else child.kill();
            };
          },
          onData: (chunk) => {
            buffer += chunk;
            let lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
              try {
                const e = JSON.parse(line);
                if (e.type === "thread.started") job.sessionId = e.thread_id;
                if (e.type === "assistant") {
                  for (const c of e.message?.content || [])
                    if (c.type === "text") text += c.text;
                }
                if (e.type === "result" && e.result) text = e.result;
                if (
                  e.type === "item.completed" &&
                  e.item?.type === "agent_message"
                )
                  text = e.item.text;
                if (e.type === "turn.completed") job.usage = e.usage;
                if (e.type === "error" || e.error)
                  emit("error", JSON.stringify(e));
                if (e.type === "item.started")
                  emit("info", e.item?.type || "Working");
                if (e.type === "result" && e.usage) job.usage = e.usage;
              } catch {}
            }
          },
        });
        if (provider === "codex" && fs.existsSync(output))
          text = fs.readFileSync(output, "utf8");
        if (!text) text = result.stdout;
      } catch (e) {
        if (/429|rate.limit|usage.limit|quota/i.test(e.message)) {
          job.limitHit = true;
          throw Error(
            "Provider limit reached. The checkpoint is saved; resume when your allowance resets.",
          );
        }
        throw e;
      } finally {
        if (fs.existsSync(output)) fs.unlinkSync(output);
      }
    }
    if (job.cancelled) throw Error("Stopped by user");
    const latest = job.usage || {};
    job.usage = {
      input_tokens:
        (previousUsage.input_tokens || 0) +
        (latest.input_tokens || latest.prompt_tokens || 0),
      output_tokens:
        (previousUsage.output_tokens || 0) +
        (latest.output_tokens || latest.completion_tokens || 0),
      cached_input_tokens:
        (previousUsage.cached_input_tokens || 0) +
        (latest.cached_input_tokens || latest.cache_read_input_tokens || 0),
    };
    if (s.inputPrice != null || s.outputPrice != null)
      job.estimatedCost =
        (job.usage.input_tokens * (Number(s.inputPrice) || 0) +
          job.usage.output_tokens * (Number(s.outputPrice) || 0)) /
        1000000;
    job.runs = [
      ...(job.runs || []),
      {
        provider,
        model,
        role,
        durationMs: Date.now() - started,
        usage: latest,
      },
    ];
    emit("info", "Provider response received");
    return extractJSON(text);
  }
}

export class Vault {
  constructor(root) {
    this.root = root;
    this.safeStorage = null;
  }
  async set(name, value) {
    if (!/^[\w-]+$/.test(name)) throw Error("Invalid credential name");
    const file = path.join(this.root, "vault", name);
    if (!value) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return;
    }
    if (
      process.platform !== "win32" &&
      this.safeStorage?.isEncryptionAvailable()
    ) {
      atomic(file, this.safeStorage.encryptString(value));
      return;
    }
    if (process.platform !== "win32")
      throw Error(
        "Open the desktop app to store credentials with the OS keychain",
      );
    const result = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
      ],
      { input: value },
    );
    atomic(file, Buffer.from(result.stdout.trim(), "base64"));
  }
  async get(name) {
    const file = path.join(this.root, "vault", name);
    if (!fs.existsSync(file)) return null;
    const b = fs.readFileSync(file);
    if (
      process.platform !== "win32" &&
      this.safeStorage?.isEncryptionAvailable()
    )
      return this.safeStorage.decryptString(b);
    if (process.platform !== "win32")
      throw Error("Credential vault needs the desktop app");
    const result = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
      ],
      { input: b.toString("base64") },
    );
    return result.stdout.trim();
  }
  has(name) {
    return fs.existsSync(path.join(this.root, "vault", name));
  }
}

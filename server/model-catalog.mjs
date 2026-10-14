import { spawn } from "node:child_process";
import readline from "node:readline";
import crypto from "node:crypto";

// Discovery never starts a model turn or reads the providers' credential files.
async function protocolSession(executable, args, cwd, task) {
  const child = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let failure = null;
  const fail = (error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on("error", () =>
    fail(
      Error(
        "Provider CLI could not start. Check its installation in Connections.",
      ),
    ),
  );
  child.on("exit", () =>
    fail(
      Error(
        "Provider closed model discovery. Update the CLI or check its sign-in.",
      ),
    ),
  );
  child.stderr.on("data", () => {});
  child.stdin.on("error", () => {});
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const key = message.id ?? message.response?.request_id;
    const request = pending.get(key);
    if (!request) return;
    pending.delete(key);
    if (message.error || message.response?.subtype === "error")
      request.reject(
        Error(
          message.error?.message ||
            message.response?.error ||
            "Model discovery failed",
        ),
      );
    else request.resolve(message.result ?? message.response?.response);
  });
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  const request = (message) =>
    new Promise((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      const key = message.id ?? message.request_id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(
          Error(
            "Model discovery timed out. Check the provider connection and try Refresh.",
          ),
        );
      }, 30_000);
      pending.set(key, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      send(message);
    });
  try {
    return await task(request, send);
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
  }
}

export async function codexModels(executable, cwd) {
  return protocolSession(
    executable,
    ["app-server", "--stdio"],
    cwd,
    async (request, send) => {
      await request({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "framecraft_studio",
            title: "Framecraft Studio",
            version: "0.1.0",
          },
        },
      });
      send({ method: "initialized", params: {} });
      const models = [];
      let cursor;
      for (let page = 0; page < 20; page++) {
        const result = await request({
          id: page + 2,
          method: "model/list",
          params: {
            limit: 100,
            includeHidden: false,
            ...(cursor ? { cursor } : {}),
          },
        });
        models.push(
          ...(result.data || [])
            .filter((m) => !m.hidden)
            .map((m) => ({
              id: m.model || m.id,
              name: m.displayName || m.model || m.id,
              description: m.description || "",
              isDefault: Boolean(m.isDefault),
              efforts: (m.supportedReasoningEfforts || []).map(
                (e) => e.reasoningEffort,
              ),
              defaultEffort: m.defaultReasoningEffort,
            })),
        );
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return models;
    },
  );
}

export async function claudeModels(executable, cwd) {
  return protocolSession(
    executable,
    [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--safe-mode",
      "--tools",
      "",
    ],
    cwd,
    async (request) => {
      const result = await request({
        type: "control_request",
        request_id: crypto.randomUUID(),
        request: { subtype: "initialize", hooks: {} },
      });
      return (result.models || []).map((m) => ({
        id: m.value,
        name: m.displayName || m.value,
        description: m.description || "",
        efforts: m.supportedEffortLevels || [],
        isDefault: m.value === "default",
      }));
    },
  );
}

export class ModelCatalog {
  constructor(store, vault, resolveCLI) {
    this.store = store;
    this.vault = vault;
    this.resolveCLI = resolveCLI;
    this.cache = new Map();
    this.pending = new Map();
  }
  async list(provider, { refresh = false, endpoint } = {}) {
    if (!["codex", "claude", "api", "local"].includes(provider))
      throw Error("Unknown provider");
    const settings = this.store.settings();
    const base = ["api", "local"].includes(provider)
      ? String(
          endpoint ||
            (provider === "local"
              ? settings.localUrl
              : settings.apiUrl || "https://api.openai.com/v1"),
        ).replace(/\/$/, "")
      : "";
    const key = provider + ":" + base;
    const cached = this.cache.get(key);
    if (!refresh && cached && Date.now() - cached.time < 300_000)
      return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const request = (async () => {
      try {
        let models;
        if (provider === "codex")
          models = await codexModels(
            this.resolveCLI(provider),
            this.store.root,
          );
        else if (provider === "claude")
          models = await claudeModels(
            this.resolveCLI(provider),
            this.store.root,
          );
        else {
          const url = new URL(base);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw Error(
              "Use an HTTP(S) model endpoint without credentials in its URL",
            );
          // A saved API key may only be sent to the configured API base URL.
          const configured = String(
            settings.apiUrl || "https://api.openai.com/v1",
          ).replace(/\/$/, "");
          if (provider === "api" && base !== configured)
            throw Error(
              "Save the API endpoint in Connections before fetching its model list",
            );
          const apiKey =
            provider === "api" ? await this.vault.get("apiKey") : null;
          if (provider === "api" && !apiKey)
            throw Error("Add an API key in Connections, then refresh models");
          const response = await fetch(base + "/models", {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            signal: AbortSignal.timeout(15_000),
            redirect: "error",
          });
          if (!response.ok)
            throw Error(
              `Model list returned HTTP ${response.status}. Check the endpoint and credentials.`,
            );
          const data = await response.json();
          if (!Array.isArray(data.data))
            throw Error(
              "This endpoint did not return an OpenAI-compatible model list",
            );
          models = data.data.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description || "",
            efforts: [],
          }));
        }
        const unique = [
          ...new Map(
            models
              .filter((m) => typeof m.id === "string" && m.id)
              .map((m) => [m.id, m]),
          ).values(),
        ];
        const value = {
          provider,
          models: unique,
          fetchedAt: new Date().toISOString(),
          source:
            provider === "codex"
              ? "Codex CLI"
              : provider === "claude"
                ? "Claude Code CLI"
                : base + "/models",
        };
        this.cache.set(key, { time: Date.now(), value });
        return value;
      } catch (error) {
        if (error.message === "fetch failed")
          error = Error(
            `Could not reach ${provider === "local" ? "the local model server" : "the API endpoint"}. Check the endpoint in Connections and make sure the server is running.`,
          );
        if (cached)
          return { ...cached.value, stale: true, warning: error.message };
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, request);
    return request;
  }
}

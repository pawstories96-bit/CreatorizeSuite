// Job-scoped stdio MCP. Stdout is reserved exclusively for protocol messages.
import readline from "node:readline";
const endpoint = process.env.FRAMECRAFT_TOOL_URL;
const token = process.env.FRAMECRAFT_TOOL_TOKEN;
if (!endpoint || !token)
  throw Error("Start this bridge through a Framecraft agent job");
const origin = new URL(endpoint).origin;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw Error("Local endpoint required");
const write = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const input = readline.createInterface({ input: process.stdin });
input.on("line", async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON" },
    });
    return;
  }
  if (message.id === undefined) return;
  let result;
  switch (message.method) {
    case "initialize":
      result = {
        protocolVersion: [
          "2024-11-05",
          "2025-03-26",
          "2025-06-18",
          "2025-11-25",
        ].includes(message.params?.protocolVersion)
          ? message.params.protocolVersion
          : "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "framecraft", version: "0.1.0" },
      };
      break;
    case "ping":
      result = {};
      break;
    case "tools/list":
    case "tools/call":
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            message.method === "tools/list"
              ? { name: "__list" }
              : message.params,
          ),
          signal: AbortSignal.timeout(90_000),
        });
        result = await response.json();
        if (!response.ok) throw Error(result.error || "Preview failed");
      } catch (e) {
        result = {
          isError: true,
          content: [{ type: "text", text: e.message }],
        };
      }
      break;
    default:
      write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Method not supported" },
      });
      return;
  }
  write({ jsonrpc: "2.0", id: message.id, result });
});
input.on("close", () => process.exit(0));

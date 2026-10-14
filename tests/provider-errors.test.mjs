import test from "node:test";
import assert from "node:assert/strict";
import { providerError, savedJobError } from "../server/provider-errors.mjs";
import { run } from "../server/core.mjs";
test("a real failed CLI process preserves stdout so warnings cannot hide quota errors", async () => {
  let error;
  try {
    await run(process.execPath, [
      "-e",
      `process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:'You have hit your usage limit. Try again at 6:08 PM.'}})+'\n');process.stderr.write('WARN plugin icon ignored\nWARN PowerShell snapshots unsupported\n');process.exit(1)`,
    ]);
  } catch (e) {
    error = e;
  }
  assert.equal(error.exitCode, 1);
  const result = providerError(error);
  assert.equal(result.limit, true);
  assert.match(result.message, /usage limit/);
  assert.doesNotMatch(result.message, /WARN/);
});
test("old saved warning-only failures display the actual error from the latest attempt", () => {
  const j = {
    error: "WARN plugin icon",
    events: [
      { type: "info", text: "Using codex" },
      {
        type: "error",
        text: JSON.stringify({
          type: "turn.failed",
          error: { message: "Usage limit reached" },
        }),
      },
    ],
  };
  assert.match(savedJobError(j), /usage limit/i);
  j.events.push({ type: "info", text: "Using claude" });
  j.error = "claude.exe timed out";
  assert.match(savedJobError(j), /timeout/);
  assert.doesNotMatch(savedJobError(j), /usage limit/i);
});

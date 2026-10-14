export function eventError(event) {
  if (event.type === "turn.failed")
    return event.error?.message || "Provider turn failed";
  if (event.type === "error")
    return (
      event.message ||
      event.error?.message ||
      (typeof event.error === "string" ? event.error : "")
    );
  if (
    event.type === "result" &&
    (event.is_error || event.subtype?.startsWith("error"))
  )
    return (
      event.result ||
      (event.errors || []).join("; ") ||
      "Provider reported an unsuccessful turn"
    );
  return "";
}
export function providerError(error, structured = "") {
  let detail = structured;
  if (!detail)
    for (const line of String(error.stdout || "").split("\n")) {
      try {
        detail = eventError(JSON.parse(line)) || detail;
      } catch {}
    }
  if (!detail) detail = error.message || "Provider failed";
  const limit =
    /429|rate[ ._-]?limit|usage[ ._-]?limit|quota|hit your.*limit/i.test(
      detail,
    );
  if (limit)
    return {
      message: `Provider usage limit reached. ${detail.replace(/^Error:\s*/i, "").slice(0, 1200)}`,
      limit: true,
    };
  if (/timed out/i.test(detail))
    return {
      message:
        "The provider did not respond before the timeout. Check its connection and retry, or choose another model.",
      limit: false,
    };
  const lines = detail
    .split("\n")
    .filter((l) => l.trim() && !/\b(WARN|INFO|DEBUG)\b/.test(l));
  return {
    message:
      lines.join("\n").slice(-1800) ||
      "The provider exited without a usable response. Retry the connection test; diagnostic warnings are available in the job log.",
    limit: false,
  };
}
export function savedJobError(job) {
  if (!job.error) return "";
  let structured = "";
  for (const e of job.events || []) {
    if (e.type === "info" && e.text.startsWith("Using ")) structured = "";
    try {
      structured = eventError(JSON.parse(e.text)) || structured;
    } catch {}
  }
  return providerError({ message: job.error }, structured).message;
}

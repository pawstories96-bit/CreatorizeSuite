import fs from "node:fs";
import path from "node:path";

// Poll canonical scene JSON so atomic editor saves and network-mounted workspaces
// behave the same. Changes are processed through the normal per-project job lock.
export function watchScenes(store, pipeline) {
  const stamps = new Map();
  const scan = () => {
    if (pipeline.suspended) return;
    const jobs = store.all("jobs");
    for (const p of store.all("projects")) {
      if (pipeline.externalLocks.has(p.id)) continue;
      if (
        jobs.some(
          (j) =>
            j.projectId === p.id && ["queued", "running"].includes(j.status),
        )
      )
        continue;
      const changed = [];
      for (const shot of p.shots) {
        const file = path.join(
          store.projectDir(p.id),
          "scenes",
          shot.id + ".json",
        );
        try {
          const stat = fs.statSync(file);
          const stamp = `${stat.mtimeMs}:${stat.size}`;
          if (stamps.get(file) === stamp) continue;
          stamps.set(file, stamp);
          try {
            if (stat.size > 2_000_000) throw Error("Scene source exceeds 2 MB");
            if (
              JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8"))) ===
              JSON.stringify(shot.scene)
            )
              continue;
          } catch {
            /* Validation and useful errors are handled by the job. */
          }
          changed.push(shot.id);
        } catch (e) {
          if (e.code !== "ENOENT") console.error("Scene watcher:", e.message);
        }
      }
      if (changed.length)
        pipeline.enqueue(p.id, "reload", { shotIds: changed });
    }
  };
  const timer = setInterval(scan, 2000);
  timer.unref();
  return { close: () => clearInterval(timer), scan };
}

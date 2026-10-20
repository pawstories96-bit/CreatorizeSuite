import { uid } from "./core.mjs";
import { normalizeUsage } from "./usage.mjs";

// Only the director mutates project state. Each provider session has its own
// abort handle, usage, tool drafts, review folder and shot-restricted context.
export async function runBuildCrew(
  pipeline,
  parent,
  targets,
  build,
  options = {},
) {
  const limit = Math.max(1, Math.min(3, Number(options.workers) || 1)),
    pending = [...targets],
    active = new Map(),
    done = new Set();
  const seeds = new Map();
  for (const shot of targets) {
    const set = options.setFor?.(shot);
    if (set && !seeds.has(set)) seeds.set(set, shot.id);
  }
  let failure = null;
  parent.usage ||= {};
  parent.crew = {
    workers: limit,
    status: "running",
    shots: targets.map((s) => ({
      id: s.id,
      title: s.title,
      status: "pending",
    })),
  };
  const update = () => {
    parent.crewUsage = Object.fromEntries(
      Object.keys(normalizeUsage()).map((k) => [k, 0]),
    );
    for (const childId of Object.values(parent.crewJobs || {})) {
      const child = pipeline.store.get("jobs", childId);
      for (const [k, v] of Object.entries(normalizeUsage(child?.usage)))
        parent.crewUsage[k] += v;
    }
    parent.progress = 5 + (85 * done.size) / Math.max(1, targets.length);
    pipeline.persist(parent);
  };
  const cancel = () => {
    for (const child of active.values()) {
      child.cancelled = true;
      child.abort?.();
    }
  };
  parent.abort = cancel;
  parent.crewJobs ||= {};
  async function run(shot) {
    const state = parent.crew.shots.find((s) => s.id === shot.id),
      old = pipeline.store.get("jobs", parent.crewJobs[shot.id]),
      child = {
        ...old,
        id: old?.id || uid(),
        parentId: parent.id,
        workspaceId: parent.workspaceId,
        projectId: parent.projectId,
        action: "build-shot",
        options: {
          ...parent.options,
          scope: "shot",
          shotId: shot.id,
          shotIds: [shot.id],
        },
        agentSettingsSnapshot: parent.agentSettingsSnapshot,
        projectAgentSnapshot: parent.projectAgentSnapshot,
        status: "running",
        progress: 0,
        events: old?.events || [],
        createdAt: old?.createdAt || new Date().toISOString(),
        startedAt: new Date().toISOString(),
        cancelled: false,
      };
    delete child.error;
    delete child.limitHit;
    delete child.finishedAt;
    parent.crewJobs[shot.id] = child.id;
    active.set(shot.id, child);
    state.status = "running";
    state.jobId = child.id;
    update();
    pipeline.emit(parent, "info", `Scene builder · ${shot.id}: ${shot.title}`);
    try {
      await build(shot, child);
      if (child.cancelled || parent.cancelled) throw Error("Stopped by user");
      child.status = "done";
      child.progress = 100;
      state.status = "done";
      done.add(shot.id);
    } catch (e) {
      child.status = child.cancelled
        ? "stopped"
        : child.limitHit
          ? "paused"
          : "error";
      child.error = e.message;
      state.status = child.status;
      state.error = e.message;
      if (!failure) {
        failure = e;
        if (child.limitHit) parent.limitHit = true;
        cancel();
      }
    } finally {
      child.finishedAt = new Date().toISOString();
      pipeline.persist(child);
      active.delete(shot.id);
      update();
    }
  }
  const tasks = new Set();
  while ((pending.length || tasks.size) && !parent.cancelled) {
    while (!failure && active.size < limit && pending.length) {
      const i = pending.findIndex((shot) => {
        const seed = seeds.get(options.setFor?.(shot));
        return !seed || seed === shot.id || done.has(seed);
      });
      if (i < 0) break;
      const [shot] = pending.splice(i, 1),
        task = run(shot);
      tasks.add(task);
      task.finally(() => tasks.delete(task));
    }
    if (!tasks.size) break;
    await Promise.race(tasks);
    if (failure) break;
  }
  if (parent.cancelled) cancel();
  await Promise.allSettled([...tasks]);
  delete parent.abort;
  parent.crew.status = parent.cancelled
    ? "stopped"
    : failure
      ? "error"
      : "done";
  update();
  if (parent.cancelled) throw Error("Stopped by user");
  if (failure) throw failure;
  if (pending.length) throw Error("Build dependencies could not be resolved");
}

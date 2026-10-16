import { CronExpressionParser } from "cron-parser";
export function validateSchedule(input = {}) {
  const mode = input.mode || "daily",
    timeZone =
      input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
  if (!["daily", "cron"].includes(mode))
    throw Error("Choose a daily or cron schedule");
  if (
    mode === "daily" &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || "09:00")
  )
    throw Error("Choose a valid daily schedule time");
  const cron = String(input.cron || "0 9 * * *").trim();
  if (cron.split(/\s+/).length !== 5)
    throw Error("Use five cron fields: minute hour day month weekday");
  CronExpressionParser.parse(cron, { tz: timeZone });
  return {
    enabled: input.enabled === true,
    mode,
    time: input.time || "09:00",
    cron,
    timeZone,
  };
}
export function scheduleSlot(input, now = new Date()) {
  if (!input?.enabled) return null;
  const schedule = validateSchedule(input);
  const expression =
    schedule.mode === "cron"
      ? schedule.cron
      : `${Number(schedule.time.slice(3))} ${Number(schedule.time.slice(0, 2))} * * *`;
  const start = Math.floor(now.getTime() / 60000) * 60000;
  const date = CronExpressionParser.parse(expression, {
    currentDate: new Date(start - 1),
    tz: schedule.timeZone,
  })
    .next()
    .toDate();
  return date.getTime() <= now.getTime() && date.getTime() < start + 60000
    ? date.toISOString()
    : null;
}
export function runSchedules(store, pipeline, now = new Date()) {
  for (const routine of store.all("routines")) {
    try {
      const slot = scheduleSlot(routine.schedule, now);
      if (!slot || routine.lastScheduledSlot === slot) continue;
      routine.lastScheduledSlot = slot;
      // Claim the minute before enqueueing, so startup/retry cannot duplicate it.
      store.put("routines", routine);
      const running = store
        .all("jobs")
        .some(
          (j) =>
            j.action === "routine" &&
            j.options?.routineId === routine.id &&
            ["queued", "running", "waiting", "paused"].includes(j.status),
        );
      if (running) {
        routine.lastError =
          "Scheduled slot skipped because the previous run is still active or awaiting review.";
        store.put("routines", routine);
        continue;
      }
      pipeline.enqueue(routine.projectId || null, "routine", {
        routineId: routine.id,
      });
      delete routine.lastError;
      store.put("routines", routine);
    } catch (e) {
      store.put("routines", { ...routine, lastError: e.message });
    }
  }
}

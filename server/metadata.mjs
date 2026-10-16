export function chapterTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60),
    rest = String(value % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}
export function descriptionWithCredits(description, ledger = []) {
  const credits = ledger
    .filter((a) => a.source !== "Local import")
    .map((a) => `${a.name} — ${a.author} (${a.license}) ${a.source}`)
    .join("\n");
  const suffix = credits ? "\n\nCredits\n" + credits : "";
  if (suffix.length > 5000)
    throw Error(
      "Source credits exceed YouTube's description limit. Review the attribution ledger before uploading.",
    );
  return (
    String(description || "")
      .slice(0, 5000 - suffix.length)
      .trimEnd() + suffix
  );
}
export function autoChapters(project) {
  const points = [],
    duration = project.durationSec || project.shots.at(-1)?.end || 0;
  for (const shot of project.shots) {
    const start = points.length ? Math.floor(shot.start) : 0;
    if (
      points.length &&
      (start - points.at(-1).start < 10 || duration - start < 10)
    )
      continue;
    points.push({
      start,
      title: String(shot.title || "Chapter")
        .replace(/[\r\n]+/g, " ")
        .slice(0, 80),
    });
  }
  return points.length >= 3 ? points : [];
}
export function validateMetadata(data, project) {
  if (
    !Array.isArray(data.titles) ||
    !data.titles.length ||
    data.titles.some((s) => typeof s !== "string" || !s.trim()) ||
    typeof data.description !== "string" ||
    !Array.isArray(data.tags) ||
    data.tags.some((s) => typeof s !== "string")
  )
    throw Error("Metadata must include titles, a description and text tags");
  const chapters = autoChapters(project);
  let description = data.description
    .split("\n")
    .filter(
      (line) =>
        !/^\s*\d{1,3}:\d{2}(?::\d{2})?\s+/.test(line) &&
        !/^\s*chapters\s*:?\s*$/i.test(line),
    )
    .join("\n")
    .trim();
  if (chapters.length)
    description +=
      "\n\nChapters\n" +
      chapters.map((c) => `${chapterTime(c.start)} ${c.title}`).join("\n");
  return {
    titles: data.titles.slice(0, 3).map((s) => s.trim().slice(0, 100)),
    description: description.slice(0, 5000),
    tags: data.tags
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40),
    chapters,
  };
}

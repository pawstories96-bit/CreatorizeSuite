import { uid } from "./core.mjs";
export function audienceRoutes(app, { store, google, pipeline }) {
  const route = (method, url, fn) =>
    app[method](url, async (req, res, next) => {
      try {
        await fn(req, res);
      } catch (e) {
        next(e);
      }
    });
  route("get", "/api/youtube/videos", async (req, res) => {
    const channels = await (
      await google(
        "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
      )
    ).json();
    const playlist =
      channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlist) return res.json([]);
    const data = await (
      await google(
        "https://www.googleapis.com/youtube/v3/playlistItems?" +
          new URLSearchParams({
            part: "snippet",
            playlistId: playlist,
            maxResults: "50",
          }),
      )
    ).json();
    res.json(
      (data.items || []).map((v) => ({
        id: v.snippet.resourceId.videoId,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
      })),
    );
  });
  pipeline.youtubeInsights = async (videoId) => {
    if (!/^[\w-]{11}$/.test(videoId))
      throw Error("Choose a valid YouTube video");
    const end = new Date().toISOString().slice(0, 10),
      start = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const tasks = await Promise.allSettled([
      google(
        "https://www.googleapis.com/youtube/v3/commentThreads?" +
          new URLSearchParams({
            part: "snippet",
            videoId,
            maxResults: "50",
            order: "relevance",
            textFormat: "plainText",
          }),
      ).then((r) => r.json()),
      google(
        "https://youtubeanalytics.googleapis.com/v2/reports?" +
          new URLSearchParams({
            ids: "channel==MINE",
            startDate: start,
            endDate: end,
            metrics: "audienceWatchRatio,relativeRetentionPerformance",
            dimensions: "elapsedVideoTimeRatio",
            filters: "video==" + videoId,
          }),
      ).then((r) => r.json()),
    ]);
    const comments =
      tasks[0].status === "fulfilled"
        ? (tasks[0].value.items || []).map((t) => ({
            id: t.snippet.topLevelComment.id,
            text:
              t.snippet.topLevelComment.snippet.textOriginal ||
              t.snippet.topLevelComment.snippet.textDisplay,
            likes: t.snippet.topLevelComment.snippet.likeCount,
            url: `https://www.youtube.com/watch?v=${videoId}&lc=${encodeURIComponent(t.snippet.topLevelComment.id)}`,
          }))
        : [];
    const retention =
      tasks[1].status === "fulfilled"
        ? (tasks[1].value.rows || []).map((r) => ({
            id: "retention@" + r[0],
            progress: r[0],
            watchRatio: r[1],
            relativePerformance: r[2],
          }))
        : [];
    const warnings = tasks
      .filter((t) => t.status === "rejected")
      .map((t) => t.reason.message);
    if (!comments.length && !retention.length)
      throw Error(
        "No audience evidence is available yet. " + warnings.join("; "),
      );
    return {
      videoId,
      comments,
      retention,
      warnings,
      from: start,
      to: end,
      retrievedAt: new Date().toISOString(),
    };
  };
  route("get", "/api/youtube/videos/:id/insights", async (req, res) =>
    res.json(await pipeline.youtubeInsights(req.params.id)),
  );
  route("post", "/api/youtube/learn", async (req, res) =>
    res.json(
      pipeline.enqueue(req.body.projectId || null, "learn", {
        videoId: req.body.videoId,
      }),
    ),
  );
  route("post", "/api/learnings/:id/approve", async (req, res) => {
    const report = store.get("learnings", req.params.id),
      index = Number(req.body.index);
    if (!report || !Number.isInteger(index) || !report.suggestions[index])
      throw Error("Suggestion not found");
    if (report.approved?.includes(index)) return res.json({ ok: true });
    store.put("memory", {
      id: report.id + "-" + index,
      text: report.suggestions[index].rule,
      projectId: report.projectId || null,
      evidence: report.suggestions[index].evidence,
      sourceVideoId: report.videoId,
      updatedAt: new Date().toISOString(),
    });
    report.approved = [...(report.approved || []), index];
    store.put("learnings", report);
    res.json({ ok: true });
  });
}

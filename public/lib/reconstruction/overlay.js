// Canvas overlays are captured identically by editor preview and FFmpeg export.
export function drawDocumentaryOverlay(ctx, scene, width, height, time = 0) {
  const vertical = height > width,
    margin = 32;
  ctx.save();
  if (scene.evidence) drawEvidence(ctx, scene.evidence, width, height, time);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const chip = (text, y, size, maxWidth) => {
    ctx.font = `${size}px monospace`;
    const w = Math.min(maxWidth, ctx.measureText(text).width + 24);
    ctx.fillStyle = "rgba(12,15,18,.82)";
    ctx.fillRect(margin, y - size, w, size * 2);
    ctx.fillStyle = "#f3f1eb";
    ctx.fillText(text, margin + 12, y, w - 24);
  };
  if (scene.timeChip)
    chip(scene.timeChip, vertical ? 150 : height - 92, 18, width - margin * 2);
  if (scene.footnote) {
    ctx.font = "14px monospace";
    const maxWidth = width - margin * 2 - 24,
      lines = [];
    let line = "";
    for (const word of scene.footnote.split(/\s+/)) {
      if (line && ctx.measureText(line + " " + word).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    const bottom = vertical ? height - 190 : height - 30;
    // Keep all supplied source text readable; it is never silently truncated.
    lines.forEach((text, i) =>
      chip(text, bottom - (lines.length - 1 - i) * 28, 14, width - margin * 2),
    );
  }
  ctx.restore();
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = "",
    start = 0,
    cursor = 0;
  for (const word of text.split(/\s+/)) {
    const index = text.indexOf(word, cursor);
    cursor = index + word.length;
    if (line && ctx.measureText(line + " " + word).width > width) {
      lines.push({ text: line, start });
      line = word;
      start = index;
    } else {
      if (!line) start = index;
      line += (line ? " " : "") + word;
    }
  }
  if (line) lines.push({ text: line, start });
  return lines;
}
function drawEvidence(c, e, w, h, t) {
  const vertical = h > w,
    dark = e.theme === "dark",
    ink = dark ? "#f3f1ed" : "#17181a",
    sub = dark ? "#b8bcc4" : "#62666e";
  const x = w * 0.1,
    content = w * 0.8,
    top = vertical ? h * 0.2 : h * 0.15,
    bottom = vertical ? h * 0.73 : h * 0.79;
  c.fillStyle = dark ? "#10151d" : "#e7e7e5";
  c.fillRect(0, 0, w, h);
  c.textAlign = "left";
  c.textBaseline = "top";
  c.fillStyle = ink;
  const titleSize = vertical ? 32 : 38;
  c.font = `700 ${titleSize}px Inter,Arial`;
  const titles = wrap(c, e.title, content);
  titles.forEach((v, i) => c.fillText(v.text, x, top + i * titleSize * 1.2));
  let y = top + titles.length * titleSize * 1.2 + 28;
  if (e.kind === "chart") {
    const pts = e.points,
      left = x + 60,
      right = w - x,
      base = bottom - 55,
      ceiling = y + 20;
    const xmin = pts[0][0],
      xmax = pts.at(-1)[0],
      ymin = Math.min(0, ...pts.map((p) => p[1])),
      ymax = Math.max(...pts.map((p) => p[1]));
    const sx = (v) => left + ((v - xmin) / (xmax - xmin)) * (right - left),
      sy = (v) => base - ((v - ymin) / (ymax - ymin || 1)) * (base - ceiling);
    c.font = "16px monospace";
    c.textAlign = "right";
    c.strokeStyle = dark ? "#333b46" : "#c7c9cd";
    c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = ymin + ((ymax - ymin) * i) / 4,
        y = sy(v);
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
      c.fillStyle = sub;
      c.fillText(Number(v.toPrecision(4)).toString(), left - 12, y - 8);
    }
    const progress = Math.max(0, Math.min(1, (t - e.delay) / e.duration)),
      end = xmin + (xmax - xmin) * progress;
    c.strokeStyle = "#2f6fdb";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(sx(pts[0][0]), sy(pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      if (a[0] > end) break;
      const k = Math.min(1, (end - a[0]) / (b[0] - a[0]));
      c.lineTo(sx(a[0] + (b[0] - a[0]) * k), sy(a[1] + (b[1] - a[1]) * k));
    }
    c.stroke();
    c.fillStyle = sub;
    c.textAlign = "left";
    c.fillText(String(xmin), left, base + 14);
    c.textAlign = "right";
    c.fillText(String(xmax), right, base + 14);
    c.textAlign = "center";
    c.fillText(e.xLabel, (left + right) / 2, base + 32);
    c.textAlign = "left";
    c.fillText(e.yLabel, x, ceiling - 25);
  } else {
    if (e.kind === "stat") {
      c.font = `800 ${vertical ? 90 : 130}px Inter,Arial`;
      c.fillText(e.value, x, y, content);
      y += vertical ? 115 : 155;
    }
    let size = e.kind === "article" ? 28 : e.kind === "quote" ? 44 : 48;
    let lines;
    do {
      c.font = `${e.kind === "article" ? "400" : "600"} ${size}px ${e.kind === "article" ? "Georgia" : "Inter,Arial"}`;
      lines = wrap(c, e.text, content);
      if (lines.length * size * 1.45 <= bottom - y) break;
      size--;
    } while (size > 16);
    if (lines.length * size * 1.45 > bottom - y)
      throw Error(
        "Evidence text exceeds the safe area; shorten the excerpt or title",
      );
    lines.forEach((line, i) => {
      const ly = y + i * size * 1.45;
      for (const mark of e.highlights) {
        const start = e.text.indexOf(mark.phrase),
          end = start + mark.phrase.length;
        const a = Math.max(start, line.start),
          b = Math.min(end, line.start + line.text.length);
        if (b <= a) continue;
        const k = Math.max(0, Math.min(1, (t - mark.at) / mark.duration));
        const offset = c.measureText(line.text.slice(0, a - line.start)).width,
          span = c.measureText(
            line.text.slice(a - line.start, b - line.start),
          ).width;
        c.fillStyle = dark ? "#8b6b16" : "#f5d869";
        c.fillRect(x + offset, ly - 2, span * k, size * 1.2);
      }
      c.fillStyle = ink;
      c.fillText(line.text, x, ly);
    });
  }
  c.fillStyle = sub;
  c.font = "16px monospace";
  c.textAlign = "left";
  const attribution = [
    e.who,
    e.source,
    e.kind === "article" ? "Excerpt re-typeset" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  wrap(c, attribution, content).forEach((v, i) =>
    c.fillText(v.text, x, bottom + 30 + i * 23),
  );
}

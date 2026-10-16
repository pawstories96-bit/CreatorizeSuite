// Export the same composite canvas the editor displays. This avoids waiting on
// browser window compositing and screenshot animation stabilization per frame.
export async function capturePNG(page, time, width, height) {
  const encoded = await page.evaluate(
    async ({ time, width, height }) => {
      await window.FC.renderFrame(time);
      let canvas = document.querySelector("#stage");
      if (canvas.width !== width || canvas.height !== height) {
        const output = (window.__creatorizeExportCanvas ||=
          document.createElement("canvas"));
        if (output.width !== width || output.height !== height) {
          output.width = width;
          output.height = height;
        }
        const ctx = output.getContext("2d");
        ctx.imageSmoothingEnabled = canvas.style.imageRendering !== "pixelated";
        ctx.drawImage(canvas, 0, 0, width, height);
        canvas = output;
      }
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { time, width, height },
  );
  return Buffer.from(encoded, "base64");
}

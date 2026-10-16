import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import { uid } from "./core.mjs";
import { validImage } from "./cloud-images.mjs";

export function flowURL(value = "https://labs.google/fx/tools/flow") {
  const url = new URL(value);
  if (
    url.origin !== "https://labs.google" ||
    !/^\/fx\/(?:[a-z-]+\/)?tools\/flow(?:\/|$)/.test(url.pathname) ||
    url.username ||
    url.password
  )
    throw Error(
      "Use a Google Flow project URL on https://labs.google/fx/tools/flow",
    );
  return url.href;
}
export class FlowBridge {
  constructor(store) {
    this.store = store;
    this.context = null;
    this.page = null;
    this.busy = false;
    this.opening = null;
  }
  async open() {
    if (this.opening) return this.opening;
    this.opening = this.openBrowser().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }
  async openBrowser() {
    if (!this.context) {
      const profile = path.join(this.store.root, "browser-flow"),
        options = { headless: false, viewport: null, acceptDownloads: true };
      try {
        this.context = await chromium.launchPersistentContext(profile, {
          ...options,
          channel: "chrome",
        });
      } catch {
        this.context = await chromium.launchPersistentContext(profile, {
          ...options,
          ...(process.env.FRAMECRAFT_BROWSER
            ? { executablePath: process.env.FRAMECRAFT_BROWSER }
            : {}),
        });
      }
      this.context.on("close", () => {
        this.context = null;
        this.page = null;
      });
    }
    this.page =
      this.context.pages().find((p) => {
        try {
          flowURL(p.url());
          return true;
        } catch {
          return false;
        }
      }) || (await this.context.newPage());
    const target = flowURL(this.store.settings().flowProjectUrl || undefined);
    if (
      !this.page.url().includes("/tools/flow") ||
      (this.store.settings().flowProjectUrl && this.page.url() !== target)
    )
      await this.page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
    await this.page.bringToFront();
    return this.status();
  }
  async controls() {
    if (!this.page || this.page.isClosed()) return {};
    try {
      flowURL(this.page.url());
    } catch {
      return {};
    }
    const settings = this.store.settings(),
      prompt = settings.flowPromptSelector
        ? this.page.locator(settings.flowPromptSelector)
        : this.page.locator(
            'textarea, [role="textbox"][contenteditable="true"], [contenteditable="true"][data-slate-editor]',
          );
    const generate = settings.flowGenerateSelector
      ? this.page.locator(settings.flowGenerateSelector)
      : this.page.getByRole("button", { name: /^Generate Image(?:s)?$/i });
    return {
      prompt: prompt.filter({ visible: true }),
      generate: generate.filter({ visible: true }),
    };
  }
  async status() {
    const { prompt, generate } = await this.controls(),
      ready =
        !!prompt &&
        (await prompt.count()) === 1 &&
        (await generate.count()) === 1;
    return {
      open: !!this.page && !this.page.isClosed(),
      ready,
      busy: this.busy,
      message: ready
        ? "Flow image controls are ready. Generation uses your Flow account and available credits."
        : "Open the browser, sign in yourself, open a Flow project and select Image mode. Keep one prompt box visible.",
    };
  }
  async generate({ prompt, references = [], signal, project, purpose }) {
    if (this.busy)
      throw Error(
        "Google Flow is processing another image. Wait for that request to finish.",
      );
    const status = await this.status();
    if (!status.ready) throw Error(status.message);
    this.busy = true;
    signal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(600000)])
      : AbortSignal.timeout(600000);
    let record,
      downloads = [],
      downloadListener;
    try {
      const fingerprint = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            project: project.id,
            purpose,
            prompt,
            refs: references.map((r) =>
              crypto.createHash("sha256").update(r.bytes).digest("hex"),
            ),
          }),
        )
        .digest("hex");
      record = this.store
        .all("flowRequests")
        .find((r) => r.fingerprint === fingerprint && r.status === "submitted");
      const { prompt: input, generate } = await this.controls();
      if (!record) {
        // Reference files go through Flow's public upload control. No cookies,
        // authorization headers or private generation endpoints are inspected.
        if (references.length) {
          const fileInput = this.store.settings().flowUploadSelector
            ? this.page.locator(this.store.settings().flowUploadSelector)
            : this.page.locator('input[type="file"][accept*="image"]');
          if ((await fileInput.count()) !== 1)
            throw Error(
              "Flow's image upload control is unavailable. Add the reference upload selector in Settings or attach references in Flow manually and generate there.",
            );
          await fileInput.setInputFiles(
            references.map((r) => ({
              name: r.name,
              mimeType: r.mime,
              buffer: r.bytes,
            })),
          );
          // Wait for the public image previews rather than submitting while
          // uploads are still in progress.
          await this.page.waitForFunction(
            () => !document.querySelector('[role="progressbar"]'),
            null,
            { timeout: 30000 },
          );
        }
        await input.fill(prompt);
        const before = await this.images();
        record = this.store.put("flowRequests", {
          id: uid(),
          projectId: project.id,
          fingerprint,
          status: "prepared",
          before,
          createdAt: new Date().toISOString(),
        });
        downloads = [];
        downloadListener = (d) => downloads.push(d);
        this.page.on("download", downloadListener);
        signal.throwIfAborted();
        // Exactly one submit. A timed-out request remains resumable and is
        // never automatically submitted again on a later retry.
        await generate.click({ timeout: 10000 });
        record.status = "submitted";
        this.store.put("flowRequests", record);
      }
      const referenceHashes = new Set(
        references.map((r) =>
          crypto.createHash("sha256").update(r.bytes).digest("hex"),
        ),
      );
      while (!signal.aborted) {
        if (this.page.isClosed())
          throw Error(
            "Flow browser was closed. Reopen it to retrieve the pending image.",
          );
        flowURL(this.page.url());
        const alerts = await this.page
          .locator('[role="alert"]')
          .allTextContents();
        if (
          alerts.some((t) =>
            /(?:not enough|insufficient|out of).{0,20}credits|generation failed|couldn.t generate|unusual traffic|captcha/i.test(
              t,
            ),
          )
        )
          throw Error(alerts.join(" ").slice(0, 500));
        const newImages = (await this.images()).filter(
          (url) => !record.before.includes(url),
        );
        for (const src of newImages.reverse()) {
          const value = await this.page
            .evaluate(async (src) => {
              const response = await fetch(src);
              if (!response.ok) return null;
              const blob = await response.blob();
              if (
                blob.size > 50 * 1024 * 1024 ||
                !/^image\/(png|jpeg|webp)$/.test(blob.type)
              )
                return null;
              return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }, src)
            .catch(() => null);
          if (!value) continue;
          const bytes = Buffer.from(value.split(",")[1], "base64");
          if (
            referenceHashes.has(
              crypto.createHash("sha256").update(bytes).digest("hex"),
            )
          )
            continue;
          validImage(bytes);
          record.status = "completed";
          this.store.put("flowRequests", record);
          return {
            bytes,
            details: {
              provider: "flow",
              model: "Selected in Google Flow",
              requestId: record.id,
            },
          };
        }
        if (downloads.length) {
          const download = downloads.shift(),
            stream = await download.createReadStream();
          if (stream) {
            const chunks = [];
            let total = 0;
            for await (const chunk of stream) {
              total += chunk.length;
              if (total > 50 * 1024 * 1024)
                throw Error("Flow download exceeds 50 MB");
              chunks.push(chunk);
            }
            const bytes = Buffer.concat(chunks);
            validImage(bytes);
            record.status = "completed";
            this.store.put("flowRequests", record);
            return {
              bytes,
              details: {
                provider: "flow",
                model: "Selected in Google Flow",
                requestId: record.id,
              },
            };
          }
        }
        await delay(1500, undefined, { signal });
      }
      signal.throwIfAborted();
    } finally {
      if (downloadListener) this.page?.off("download", downloadListener);
      this.busy = false;
    }
  }
  async images() {
    const selector = this.store.settings().flowResultSelector || "img";
    return this.page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (n) =>
              n instanceof HTMLImageElement &&
              n.complete &&
              n.naturalWidth >= 512 &&
              n.naturalHeight >= 256,
          )
          .map((n) => n.currentSrc || n.src),
      );
  }
  async close() {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

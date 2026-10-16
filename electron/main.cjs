const {
  app,
  BrowserWindow,
  shell,
  safeStorage,
  powerSaveBlocker,
  Tray,
  Menu,
  Notification,
  nativeImage,
} = require("electron");
const path = require("node:path");
let service, tray, win;
const fs = require("node:fs");
const resources = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..", "resources");
process.env.PATH =
  path.join(resources, "ffmpeg") + path.delimiter + process.env.PATH;
const bundledBrowser = path.join(resources, "browser", "chrome.exe");
if (fs.existsSync(bundledBrowser))
  process.env.FRAMECRAFT_BROWSER = bundledBrowser;
app.whenReady().then(async () => {
  const { startServer } = await import("../server/index.mjs");
  service = await startServer({
    root:
      process.env.CREATORIZE_WORKSPACE ||
      process.env.FRAMECRAFT_WORKSPACE ||
      path.join(app.getPath("documents"), fs.existsSync(path.join(app.getPath("documents"), "Framecraft Workspace")) ? "Framecraft Workspace" : "Creatorize Workspace"),
    port: 0,
    safeStorage,
    openPath: (p) => shell.openPath(p),
  });
  const icon = path.join(__dirname, "..", "public", "icon.png");
  win = new BrowserWindow({
    width: 1536,
    height: 960,
    minWidth: 1100,
    minHeight: 740,
    title: "Creatorize Suite",
    icon,
    backgroundColor: "#151616",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(service.url + "/")) event.preventDefault();
  });
  await win.loadURL(service.url);
  tray = new Tray(
    nativeImage.createFromPath(icon).resize({ width: 24, height: 24 }),
  );
  tray.setToolTip("Creatorize Suite");
  const show = () => {
    win.show();
    win.focus();
  };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Creatorize Suite", click: show },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", show);
  win.on("close", (event) => {
    if (!exiting && service.store.settings().closeToTray) {
      event.preventDefault();
      win.hide();
    }
  });
  let blocker;
  let loginSetting,
    seen = new Map(service.store.all("jobs").map((j) => [j.id, j.status]));
  setInterval(() => {
    const settings = service.store.settings();
    if (app.isPackaged && loginSetting !== !!settings.startAtLogin) {
      loginSetting = !!settings.startAtLogin;
      app.setLoginItemSettings({ openAtLogin: loginSetting });
    }
    for (const j of service.store.all("jobs")) {
      if (
        (settings.notifications || j.action === "notify" || j.notification) &&
        seen.get(j.id) !== j.status &&
        ["done", "error", "waiting"].includes(j.status)
      )
        new Notification({
          title: "Creatorize Suite",
          body:
            j.notification ||
            `${j.action}: ${j.status}${j.error ? " — " + j.error.slice(0, 150) : ""}`,
          icon,
        }).show();
      seen.set(j.id, j.status);
    }
    if (service.pipeline.active.size && !blocker)
      blocker = powerSaveBlocker.start("prevent-app-suspension");
    if (!service.pipeline.active.size && blocker) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
  }, 3000);
});
app.on("window-all-closed", () => app.quit());
let exiting = false;
app.on("before-quit", (event) => {
  if (service && !exiting) {
    event.preventDefault();
    exiting = true;
    service.close().finally(() => app.exit(0));
  }
});

import { app, BrowserWindow, shell, dialog, ipcMain } from "electron";
import path from "path";
import { spawn } from "child_process";
import { autoUpdater } from "electron-updater";

const isDev = process.env.NODE_ENV === "development";
const PORT = 4827;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // window.open() 호출 시 외부 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // F12로 DevTools 열기 (프로덕션 디버깅용)
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "F12") {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startNextServer(): Promise<void> {
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = "localhost";

  if (app.isPackaged) {
    const standaloneDir = path.join(process.resourcesPath, "standalone");
    process.chdir(standaloneDir);
    require(path.join(standaloneDir, "server.js"));
    return Promise.resolve();
  }

  // Non-packaged (electron:preview): use next start
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      env: { ...process.env, PORT: String(PORT) },
    });

    child.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      console.log("[next]", msg);
      if (msg.includes("Ready") || msg.includes(`localhost:${PORT}`)) {
        resolve();
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.error("[next]", data.toString());
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`next start exited with code ${code}`));
    });

    // Fallback: resolve after timeout even if no "Ready" message
    setTimeout(resolve, 5000);
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "업데이트 available",
        message: `새 버전 (v${info.version})이 있습니다. 다운로드하시겠습니까?`,
        buttons: ["다운로드", "나중에"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        title: "업데이트 준비 완료",
        message: "업데이트가 다운로드되었습니다. 지금 재시작하시겠습니까?",
        buttons: ["재시작", "나중에"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(async () => {
  const { default: fixPath } = await import("fix-path");
  fixPath();
  process.env.TEAMMAKER_USER_DATA = app.getPath("userData");
  process.env.TEAMMAKER_PLATFORM = process.platform;

  if (!isDev) {
    await startNextServer();
  }

  ipcMain.handle("app-relaunch", () => {
    app.relaunch();
    app.exit(0);
  });

  createWindow();

  if (!isDev) {
    setupAutoUpdater();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

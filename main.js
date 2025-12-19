const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { startServer } = require("./backend/server");
const { loadConfig, saveConfig } = require("./backend/configManager");
const {
  startIntegrationManager,
  reloadIntegration,
  stopIntegrationManager,
} = require("./backend/integrationManager");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let tray = null;
let isQuiting = false;

ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:save", (_, data) => {
  const current = loadConfig();
  const nextConfig = { ...current, ...data };
  saveConfig(nextConfig);
  reloadIntegration();
  return nextConfig;
});
ipcMain.handle("dialog:select-directory", async (_event, defaultPath = "") => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    defaultPath,
  });
  return result;
});

ipcMain.handle("status:check", async () => {
  const config = loadConfig();
  const results = {
    endpoint: { ok: false, message: "Checking..." },
    csv: { ok: false, message: "Checking..." },
  };

  // 1. Check Endpoint
  try {
    const response = await axios.get("https://cloud.barnomala.com/api/attendance/receive", { timeout: 5000 }).catch(e => e.response || { status: 500 });
    // Even a 405/404 from the server means the endpoint is reachable
    if (response.status < 500) {
      results.endpoint = { ok: true, message: "Connected" };
    } else {
      results.endpoint = { ok: false, message: `Error ${response.status}` };
    }
  } catch (error) {
    results.endpoint = { ok: false, message: "Unreachable" };
  }

  // 2. Check CSV Directory and today's file
  try {
    const { findTodayCsvFile } = require("./backend/uploader");
    if (config.CSV_UPLOAD_DIR && fs.existsSync(config.CSV_UPLOAD_DIR)) {
      const todayFile = await findTodayCsvFile(config.CSV_UPLOAD_DIR);
      if (todayFile) {
        results.csv = { ok: true, message: "Directory OK & Today's File Found" };
      } else {
        results.csv = { ok: true, message: "Directory OK (No file today yet)" };
      }
    } else {
      results.csv = { ok: false, message: "Invalid Directory" };
    }
  } catch (error) {
    results.csv = { ok: false, message: "Check failed" };
  }

  return results;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, "favicon.ico"),
    show: true, // ✅ Show window immediately on launch
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");

  // Hide to tray instead of closing
  win.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  mainWindow = win;
  return win;
}

// 🧠 Auto-launch at system startup
function enableAutoLaunch() {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath("exe"),
    args: [],
  });
  console.log("Auto-launch:", app.getLoginItemSettings());
}

// 🧩 Create system tray
function createTray() {
  const iconPath = path.join(__dirname, "favicon.ico");
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow().show();
        }
      },
    },
    {
      label: "Quit",
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("My App (Running in background)");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow().show();
    }
  });
}

// 🧱 App ready
app.whenReady().then(() => {
  enableAutoLaunch();
  startServer();
  startIntegrationManager();
  checkForUpdates();

  createTray();

  // ✅ Create and show the window on launch
  mainWindow = createWindow();
  mainWindow.show();
});

// Auto-update logic
function checkForUpdates() {
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-available", () => {
    console.log("Update available — downloading...");
    try {
      mainWindow &&
        mainWindow.webContents.send("update:event", { status: "available" });
    } catch (e) {}
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("Update downloaded:", info.version);
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: "A new version is ready. Restart now?",
        buttons: ["Restart", "Later"],
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("No update available");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
  });

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (e) {
    console.error("Failed to check for updates on startup", e);
  }
}

// Keep app running in tray even when window is closed
app.on("window-all-closed", (e) => {
  e.preventDefault(); // Don’t quit fully
});

app.on("activate", () => {
  if (mainWindow) mainWindow.show();
});

app.on("before-quit", () => {
  stopIntegrationManager();
});

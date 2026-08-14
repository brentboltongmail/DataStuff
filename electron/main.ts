import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  cancelQuery,
  commit,
  connect,
  disconnect,
  execute,
  explain,
  getStatus,
  listColumns,
  listObjects,
  listPrimaryKeys,
  rollback,
  shutdownBridge,
} from "./oracle";
import {
  clearPassword,
  isPasswordStorageAvailable,
  loadPassword,
  savePassword,
} from "./secrets";
import {
  closeSqlPage,
  createSqlPage,
  getSqlDir,
  loadWorkspace,
  openSqlPagesFromPaths,
  renameSqlPage,
  saveWorkspace,
} from "./sqlPages";
import type { ConnectionConfig, SavedWorkspace, SqlTab } from "../src/types";

import fsSync from "node:fs";

// Explicit macOS application name for Dock, Menu Bar, and Keychain
app.name = "DataStuff";
app.setName("DataStuff");
process.title = "DataStuff";

// Cap V8 JavaScript memory heap ceiling at 768 MB
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=768");

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public");

const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "build/icon.png")
  : path.join(__dirname, "../build/icon.png");

let mainWindow: BrowserWindow | null = null;

function setupAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "DataStuff",
            submenu: [
              { role: "about" as const, label: "About DataStuff" },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const, label: "Quit DataStuff" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "DataStuff",
    icon: fsSync.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 8, y: 6 },
    backgroundColor: "#16131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("FAILED TO LOAD HTML:", errorCode, errorDescription, validatedURL);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER] L${line} (${sourceId}): ${message}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("RENDER PROCESS GONE:", details.reason, details.exitCode);
    if (details.reason !== "clean-exit" && mainWindow) {
      mainWindow.reload();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("oracle:connect", async (_event, config: ConnectionConfig) => {
    return connect(config);
  });
  ipcMain.handle("oracle:disconnect", async () => disconnect());
  ipcMain.handle("oracle:cancel", async () => cancelQuery());
  ipcMain.handle("oracle:status", async () => getStatus());
  ipcMain.handle(
    "oracle:execute",
    async (_event, sql: string, maxRows?: number, binds?: unknown[]) =>
      execute(sql, maxRows, binds),
  );
  ipcMain.handle(
    "oracle:explain",
    async (_event, sql: string, binds?: unknown[]) => explain(sql, binds),
  );
  ipcMain.handle("oracle:commit", async () => commit());
  ipcMain.handle("oracle:rollback", async () => rollback());
  ipcMain.handle("oracle:listObjects", async () => listObjects());
  ipcMain.handle("oracle:listColumns", async (_event, objectName: string) =>
    listColumns(objectName),
  );
  ipcMain.handle("oracle:listPrimaryKeys", async (_event, objectName: string) =>
    listPrimaryKeys(objectName),
  );
  ipcMain.handle("workspace:load", async () => loadWorkspace());
  ipcMain.handle("workspace:save", async (_event, workspace: SavedWorkspace) =>
    saveWorkspace(workspace),
  );
  ipcMain.handle(
    "workspace:rename",
    async (_event, fromFileName: string, nextTitle: string) =>
      renameSqlPage(fromFileName, nextTitle),
  );
  ipcMain.handle(
    "workspace:create",
    async (_event, title: string, sql: string) => createSqlPage(title, sql),
  );
  ipcMain.handle("workspace:close", async (_event, fileName: string) =>
    closeSqlPage(fileName),
  );
  ipcMain.handle("workspace:open", async () => {
    const dir = getSqlDir();
    await fs.mkdir(dir, { recursive: true });
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Open SQL files",
      defaultPath: dir,
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "SQL", extensions: ["sql"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { opened: false, tabs: [] as SqlTab[] };
    }
    const tabs = await openSqlPagesFromPaths(result.filePaths);
    return { opened: true, tabs };
  });
  ipcMain.handle("connections:load", async () => loadConnectionsFromDisk());
  ipcMain.handle("connections:save", async (_event, connections: unknown[]) =>
    saveConnectionsToDisk(connections),
  );
  ipcMain.handle("settings:load", async () => loadSettingsFromDisk());
  ipcMain.handle("settings:save", async (_event, settings: Record<string, unknown>) =>
    saveSettingsToDisk(settings),
  );
  ipcMain.handle("queryStats:load", async () => loadQueryStatsFromDisk());
  ipcMain.handle("queryStats:save", async (_event, stats: Record<string, unknown>) =>
    saveQueryStatsToDisk(stats),
  );
  ipcMain.handle(
    "font:generate",
    async (
      _event,
      fontName: string,
      pixelMap: Record<string, string[]>,
      gridWidth?: number,
      gridHeight?: number,
    ) => {
      const scriptPath = path.join(app.getAppPath(), "scripts", "make_pixel_font.py");
      const jsonPath = path.join(os.tmpdir(), "datastuff_font_data.json");
      const sanitized = (fontName || "MyPixelFont").replace(/[^a-zA-Z0-9]/g, "_");
      const outputPath = path.join(os.homedir(), "Desktop", `${sanitized}.ttf`);

      await fs.writeFile(
        jsonPath,
        JSON.stringify({ fontName: sanitized, pixelMap, gridWidth, gridHeight }),
        "utf8",
      );

      return new Promise((resolve, reject) => {
        const py = spawn("python3", [scriptPath, sanitized, outputPath, jsonPath]);
        py.on("close", (code: number | null) => {
          if (code === 0) {
            resolve({ success: true, path: outputPath });
          } else {
            reject(new Error(`Python generator exited with code ${code}`));
          }
        });
      });
    },
  );
  ipcMain.handle("secrets:isAvailable", () => isPasswordStorageAvailable());
  ipcMain.handle(
    "secrets:savePassword",
    async (_event, password: string, profileId?: string) =>
      savePassword(password ?? "", profileId),
  );
  ipcMain.handle("secrets:loadPassword", async (_event, profileId?: string) =>
    loadPassword(profileId),
  );
  ipcMain.handle("secrets:clearPassword", async (_event, profileId?: string) => {
    await clearPassword(profileId);
  });
  ipcMain.handle(
    "app:saveCsv",
    async (_event, csv: string, defaultName: string) => {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: "Export CSV",
        defaultPath: defaultName,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (result.canceled || !result.filePath) {
        return { saved: false };
      }
      await fs.writeFile(result.filePath, csv, "utf8");
      return { saved: true, filePath: result.filePath };
    },
  );
}

function getConnectionsFilePath(): string {
  return path.join(app.getPath("userData"), "saved-connections.json");
}

function getSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "user-settings.json");
}

async function loadSettingsFromDisk(): Promise<Record<string, unknown>> {
  try {
    const file = getSettingsFilePath();
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function saveSettingsToDisk(settings: Record<string, unknown>): Promise<{ saved: boolean }> {
  try {
    const file = getSettingsFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const existing = await loadSettingsFromDisk();
    const merged = { ...existing, ...settings };
    await fs.writeFile(file, JSON.stringify(merged, null, 2), "utf8");
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

async function loadConnectionsFromDisk(): Promise<unknown[]> {
  try {
    const file = getConnectionsFilePath();
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }
}

async function saveConnectionsToDisk(connections: unknown[]): Promise<{ saved: boolean }> {
  try {
    const file = getConnectionsFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(connections, null, 2), "utf8");
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

function getQueryStatsFilePath(): string {
  return path.join(app.getPath("userData"), "query-stats.json");
}

async function loadQueryStatsFromDisk(): Promise<Record<string, unknown>> {
  try {
    const file = getQueryStatsFilePath();
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function saveQueryStatsToDisk(stats: Record<string, unknown>): Promise<{ saved: boolean }> {
  try {
    const file = getQueryStatsFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(stats, null, 2), "utf8");
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  setupAppMenu();
  registerIpc();
  if (process.platform === "darwin" && app.dock && fsSync.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch {
      // ignore
    }
  }
  if (app.setAboutPanelOptions) {
    app.setAboutPanelOptions({
      applicationName: "DataStuff",
      applicationVersion: "0.1.0",
      iconPath: fsSync.existsSync(iconPath) ? iconPath : undefined,
    });
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  try {
    await shutdownBridge();
  } catch {
    // ignore
  }
  app.quit();
});

app.on("before-quit", async () => {
  try {
    await shutdownBridge();
  } catch {
    // ignore
  }
});

app.on("will-quit", () => {
  app.exit(0);
});

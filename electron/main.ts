import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import {
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

// Name used for the macOS Keychain “Safe Storage” item.
app.setName("DataStuff");

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public");

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "DataStuff 1.0",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#16131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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
  ipcMain.handle("oracle:status", async () => getStatus());
  ipcMain.handle(
    "oracle:execute",
    async (_event, sql: string, maxRows?: number, binds?: unknown[]) =>
      execute(sql, maxRows, binds),
  );
  ipcMain.handle("oracle:explain", async (_event, sql: string) => explain(sql));
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
  ipcMain.handle("secrets:isAvailable", () => isPasswordStorageAvailable());
  ipcMain.handle("secrets:savePassword", async (_event, password: string) =>
    savePassword(password ?? ""),
  );
  ipcMain.handle("secrets:loadPassword", async () => loadPassword());
  ipcMain.handle("secrets:clearPassword", async () => {
    await clearPassword();
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

app.whenReady().then(() => {
  registerIpc();
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  try {
    await shutdownBridge();
  } catch {
    // ignore
  }
});

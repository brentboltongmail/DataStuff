import { contextBridge, ipcRenderer } from "electron";
import type { ConnectionConfig, OracleApi, SavedWorkspace } from "../src/types";

const api: OracleApi = {
  connect: (config: ConnectionConfig) =>
    ipcRenderer.invoke("oracle:connect", config),
  disconnect: () => ipcRenderer.invoke("oracle:disconnect"),
  cancelQuery: () => ipcRenderer.invoke("oracle:cancel"),
  getStatus: () => ipcRenderer.invoke("oracle:status"),
  execute: (sql: string, maxRows?: number, binds?: unknown[]) =>
    ipcRenderer.invoke("oracle:execute", sql, maxRows, binds),
  explain: (sql: string, binds?: unknown[]) =>
    ipcRenderer.invoke("oracle:explain", sql, binds),
  commit: () => ipcRenderer.invoke("oracle:commit"),
  rollback: () => ipcRenderer.invoke("oracle:rollback"),
  listObjects: () => ipcRenderer.invoke("oracle:listObjects"),
  listColumns: (objectName: string) =>
    ipcRenderer.invoke("oracle:listColumns", objectName),
  listPrimaryKeys: (objectName: string) =>
    ipcRenderer.invoke("oracle:listPrimaryKeys", objectName),
  saveCsv: (csv: string, defaultName: string) =>
    ipcRenderer.invoke("app:saveCsv", csv, defaultName),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: (workspace: SavedWorkspace) =>
    ipcRenderer.invoke("workspace:save", workspace),
  renameSqlPage: (fromFileName: string, nextTitle: string) =>
    ipcRenderer.invoke("workspace:rename", fromFileName, nextTitle),
  createSqlPage: (title: string, sql: string) =>
    ipcRenderer.invoke("workspace:create", title, sql),
  closeSqlPage: (fileName: string) =>
    ipcRenderer.invoke("workspace:close", fileName),
  openSqlPages: () => ipcRenderer.invoke("workspace:open"),
  isPasswordStorageAvailable: () => ipcRenderer.invoke("secrets:isAvailable"),
  savePassword: (password: string) =>
    ipcRenderer.invoke("secrets:savePassword", password),
  loadPassword: () => ipcRenderer.invoke("secrets:loadPassword"),
  clearPassword: () => ipcRenderer.invoke("secrets:clearPassword"),
  loadSavedConnections: () => ipcRenderer.invoke("connections:load"),
  saveSavedConnections: (connections: unknown[]) =>
    ipcRenderer.invoke("connections:save", connections),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save", settings),
};

contextBridge.exposeInMainWorld("oracle", api);

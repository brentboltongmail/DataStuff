export interface ConnectionConfig {
  user: string;
  password: string;
  host: string;
  port: string;
  service: string;
  /** Use Oracle TCPS (TLS) instead of plain TCP. */
  tcps?: boolean;
}

export interface QueryColumn {
  name: string;
  type?: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: unknown[][];
  rowsAffected: number;
  isSelect: boolean;
  truncated: boolean;
  elapsedMs: number;
  /** Present when result came from Explain Plan. */
  indexes?: string[];
  /** Index name → definition text for explain-plan hover tooltips. */
  indexDefinitions?: Record<string, string>;
}

export interface ConnectionState {
  connected: boolean;
  user?: string;
  connectString?: string;
  mode?: "jdbc" | "thin" | "thick";
}

export type DbObjectType = "TABLE" | "VIEW" | "SYNONYM";

export interface DbObject {
  name: string;
  type: DbObjectType;
}

export interface DbColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface SqlTab {
  id: string;
  title: string;
  fileName: string;
  sql: string;
}

export interface CellEdit {
  rowIndex: number;
  columnIndex: number;
  columnName: string;
  oldValue?: unknown;
  originalValue?: unknown;
  newValue: unknown;
}

export interface EditMeta {
  table: string;
  pkColumns: string[];
  editable: boolean;
}

import type { BindVarParam } from "./bindVariables";

export type { BindVarParam };

export interface HistoryEntry {
  id: string;
  sql: string;
  ranAt: string;
  ok: boolean;
  summary: string;
}

export interface TabState {
  result: QueryResult | null;
  explainResult: QueryResult | null;
  explainError: string | null;
  editMeta: EditMeta | null;
  pendingEdits: Record<string, CellEdit>;
  bottomTab: "results" | "history" | "explain";
  history: HistoryEntry[];
  bindValues: Record<string, BindVarParam>;
  message: string;
  error: string | null;
  queryStartTime: number | null;
  queryElapsedTimeMs: number;
}

export interface SaveCsvResult {
  saved: boolean;
  filePath?: string;
}

export interface SavedWorkspace {
  tabs: SqlTab[];
  activeTabId: string;
  savedAt?: string;
  sqlDir?: string;
}

export interface OpenSqlResult {
  opened: boolean;
  tabs: SqlTab[];
}

export interface OracleApi {
  connect: (config: ConnectionConfig) => Promise<ConnectionState>;
  disconnect: () => Promise<ConnectionState>;
  cancelQuery: () => Promise<{ cancelled: boolean; message: string }>;
  getStatus: () => Promise<ConnectionState>;
  execute: (
    sql: string,
    maxRows?: number,
    binds?: unknown[],
  ) => Promise<QueryResult>;
  explain: (sql: string, binds?: unknown[]) => Promise<QueryResult>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  listObjects: () => Promise<DbObject[]>;
  listColumns: (objectName: string) => Promise<DbColumn[]>;
  listPrimaryKeys: (objectName: string) => Promise<string[]>;
  saveCsv: (csv: string, defaultName: string) => Promise<SaveCsvResult>;
  loadWorkspace: () => Promise<SavedWorkspace | null>;
  saveWorkspace: (
    workspace: SavedWorkspace,
  ) => Promise<{ saved: boolean; path: string; tabs: SqlTab[] }>;
  renameSqlPage: (fromFileName: string, nextTitle: string) => Promise<SqlTab>;
  createSqlPage: (title: string, sql: string) => Promise<SqlTab>;
  closeSqlPage: (fileName: string) => Promise<void>;
  openSqlPages: () => Promise<OpenSqlResult>;
  isPasswordStorageAvailable: () => Promise<boolean>;
  savePassword: (password: string) => Promise<{ saved: boolean }>;
  loadPassword: () => Promise<string>;
  clearPassword: () => Promise<void>;
  loadSavedConnections: <T = unknown>() => Promise<T[]>;
  saveSavedConnections: <T = unknown>(connections: T[]) => Promise<{ saved: boolean }>;
  loadSettings?: () => Promise<Record<string, unknown>>;
  saveSettings?: (settings: Record<string, unknown>) => Promise<{ saved: boolean }>;
}

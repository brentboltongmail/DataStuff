import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SavedWorkspace, SqlTab } from "../src/types";

const SESSION_FILE = ".oracle-ide-session.json";

type Session = {
  openFiles: string[];
  activeFileName: string;
};

function sqlDir(): string {
  return path.join(os.homedir(), "sql");
}

function sessionPath(): string {
  return path.join(sqlDir(), SESSION_FILE);
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.sql$/i, "");
}

export function toFileName(title: string): string {
  let base = title
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\0/g, "")
    .replace(/\.+$/g, "");
  if (!base) base = "query";
  if (!base.toLowerCase().endsWith(".sql")) {
    base = `${base}.sql`;
  }
  return base;
}

async function ensureSqlDir(): Promise<string> {
  const dir = sqlDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function listSqlFiles(): Promise<string[]> {
  const dir = await ensureSqlDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function readSession(): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionPath(), "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function writeSession(session: Session): Promise<void> {
  await ensureSqlDir();
  await fs.writeFile(sessionPath(), JSON.stringify(session, null, 2), "utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFileName(
  desired: string,
  reserved: Set<string> = new Set(),
  allowExisting?: string,
): Promise<string> {
  const dir = await ensureSqlDir();
  const wanted = toFileName(desired);
  const stem = titleFromFileName(wanted);
  let candidate = wanted;
  let i = 2;
  const allow = allowExisting?.toLowerCase();

  while (true) {
    const key = candidate.toLowerCase();
    const takenInMemory = reserved.has(key);
    const takenOnDisk =
      key !== allow && (await exists(path.join(dir, candidate)));
    if (!takenInMemory && !takenOnDisk) {
      return candidate;
    }
    candidate = `${stem}-${i}.sql`;
    i += 1;
  }
}

async function readTab(fileName: string): Promise<SqlTab> {
  const full = path.join(sqlDir(), fileName);
  const sql = await fs.readFile(full, "utf8");
  return {
    id: fileName,
    title: titleFromFileName(fileName),
    fileName,
    sql,
  };
}

export async function loadWorkspace(): Promise<SavedWorkspace> {
  const dir = await ensureSqlDir();
  const allFiles = await listSqlFiles();
  const session = await readSession();

  // Only restore files that were open in the last session — never invent a starter
  // query or open every .sql file on disk.
  const openFiles =
    session?.openFiles?.filter((name) => allFiles.includes(name)) ?? [];

  const tabs: SqlTab[] = [];
  for (const fileName of openFiles) {
    try {
      tabs.push(await readTab(fileName));
    } catch {
      // skip missing
    }
  }

  const activeFileName =
    session?.activeFileName &&
    tabs.some((tab) => tab.fileName === session.activeFileName)
      ? session.activeFileName
      : (tabs[0]?.fileName ?? "");

  await writeSession({
    openFiles: tabs.map((tab) => tab.fileName),
    activeFileName,
  });

  return {
    tabs,
    activeTabId: activeFileName,
    sqlDir: dir,
  };
}

export async function saveWorkspace(
  workspace: SavedWorkspace,
): Promise<{ saved: boolean; path: string; tabs: SqlTab[] }> {
  const dir = await ensureSqlDir();
  const used = new Set<string>();
  const savedTabs: SqlTab[] = [];

  for (const tab of workspace.tabs) {
    const previousName = tab.fileName ? toFileName(tab.fileName) : "";
    let fileName = toFileName(tab.fileName || tab.title || "query");

    if (used.has(fileName.toLowerCase())) {
      fileName = await uniqueFileName(
        titleFromFileName(fileName),
        used,
        previousName,
      );
    }
    used.add(fileName.toLowerCase());

    if (previousName && previousName !== fileName) {
      const from = path.join(dir, previousName);
      const to = path.join(dir, fileName);
      if ((await exists(from)) && !(await exists(to))) {
        await fs.rename(from, to);
      }
    }

    await fs.writeFile(path.join(dir, fileName), tab.sql ?? "", "utf8");
    savedTabs.push({
      id: fileName,
      fileName,
      title: titleFromFileName(fileName),
      sql: tab.sql ?? "",
    });
  }

  const previousActive = workspace.tabs.find(
    (tab) => tab.id === workspace.activeTabId || tab.fileName === workspace.activeTabId,
  );
  const active =
    savedTabs.find(
      (tab) =>
        tab.fileName === previousActive?.fileName ||
        tab.title === previousActive?.title,
    )?.fileName ??
    savedTabs[0]?.fileName ??
    "";

  await writeSession({
    openFiles: savedTabs.map((tab) => tab.fileName),
    activeFileName: active,
  });

  return { saved: true, path: dir, tabs: savedTabs };
}

export async function renameSqlPage(
  fromFileName: string,
  nextTitle: string,
): Promise<SqlTab> {
  const dir = await ensureSqlDir();
  const from = toFileName(fromFileName);
  const desired = toFileName(nextTitle);
  const to =
    desired.toLowerCase() === from.toLowerCase()
      ? from
      : await uniqueFileName(titleFromFileName(desired), new Set(), from);

  const fromPath = path.join(dir, from);
  const toPath = path.join(dir, to);

  if (from !== to) {
    if (!(await exists(fromPath))) {
      await fs.writeFile(fromPath, "", "utf8");
    }
    if ((await exists(toPath)) && from.toLowerCase() !== to.toLowerCase()) {
      throw new Error(`File already exists: ${to}`);
    }
    await fs.rename(fromPath, toPath);
  }

  const session = (await readSession()) ?? {
    openFiles: [to],
    activeFileName: to,
  };
  session.openFiles = session.openFiles.map((name) => (name === from ? to : name));
  if (!session.openFiles.includes(to)) session.openFiles.push(to);
  if (session.activeFileName === from) session.activeFileName = to;
  await writeSession(session);

  return readTab(to);
}

export async function createSqlPage(title = "query", sql = ""): Promise<SqlTab> {
  const dir = await ensureSqlDir();
  const fileName = await uniqueFileName(title);
  await fs.writeFile(path.join(dir, fileName), sql, "utf8");

  const session = (await readSession()) ?? {
    openFiles: [],
    activeFileName: fileName,
  };
  if (!session.openFiles.includes(fileName)) {
    session.openFiles.push(fileName);
  }
  session.activeFileName = fileName;
  await writeSession(session);

  return readTab(fileName);
}

export async function closeSqlPage(fileName: string): Promise<void> {
  const session = await readSession();
  if (!session) return;
  const name = toFileName(fileName);
  session.openFiles = session.openFiles.filter((entry) => entry !== name);
  if (session.activeFileName === name) {
    session.activeFileName = session.openFiles[0] ?? "";
  }
  await writeSession(session);
}

export function getSqlDir(): string {
  return sqlDir();
}

async function addToSession(fileName: string): Promise<SqlTab> {
  const session = (await readSession()) ?? {
    openFiles: [],
    activeFileName: fileName,
  };
  if (!session.openFiles.includes(fileName)) {
    session.openFiles.push(fileName);
  }
  session.activeFileName = fileName;
  await writeSession(session);
  return readTab(fileName);
}

/**
 * Open an existing .sql file. Files under ~/sql are opened in place.
 * Files elsewhere are copied into ~/sql (unique name if needed).
 */
export async function openSqlPageFromPath(filePath: string): Promise<SqlTab> {
  const dir = await ensureSqlDir();
  const resolved = path.resolve(filePath);
  if (!(await exists(resolved))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const dirResolved = path.resolve(dir);
  const inSqlDir =
    resolved === path.join(dirResolved, path.basename(resolved)) ||
    resolved.startsWith(dirResolved + path.sep);

  let fileName: string;
  if (inSqlDir) {
    fileName = path.basename(resolved);
    if (!/\.sql$/i.test(fileName)) {
      throw new Error("Only .sql files are supported");
    }
  } else {
    if (!/\.sql$/i.test(resolved)) {
      throw new Error("Only .sql files are supported");
    }
    fileName = await uniqueFileName(titleFromFileName(path.basename(resolved)));
    await fs.copyFile(resolved, path.join(dir, fileName));
  }

  return addToSession(fileName);
}

export async function openSqlPagesFromPaths(
  filePaths: string[],
): Promise<SqlTab[]> {
  const tabs: SqlTab[] = [];
  for (const filePath of filePaths) {
    tabs.push(await openSqlPageFromPath(filePath));
  }
  return tabs;
}


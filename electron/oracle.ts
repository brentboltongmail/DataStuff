import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface, Interface } from "node:readline";
import type {
  ConnectionConfig,
  ConnectionState,
  DbColumn,
  DbObject,
  QueryResult,
} from "../src/types";

type BridgeResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

let bridge: ChildProcessWithoutNullStreams | null = null;
let reader: Interface | null = null;
let nextId = 1;
let starting: Promise<void> | null = null;
const pending = new Map<
  number,
  {
    resolve: (value: BridgeResponse) => void;
    reject: (reason?: unknown) => void;
  }
>();

let connectedState: ConnectionState = { connected: false, mode: "jdbc" };

function projectRoot(): string {
  return path.resolve(__dirname, "..");
}

function findJava(): string {
  const candidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java") : "",
    "/opt/homebrew/opt/openjdk/bin/java",
    "/opt/homebrew/opt/openjdk@26/bin/java",
    "/opt/homebrew/opt/openjdk@21/bin/java",
    "/opt/homebrew/opt/openjdk@17/bin/java",
    "/usr/local/opt/openjdk/bin/java",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const which = spawnSync("which", ["java"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  throw new Error(
    "Java not found. Install a JDK (brew install openjdk) and restart the app.",
  );
}

function jdbcPaths() {
  const root = projectRoot();
  const jar = path.join(root, "jdbc", "lib", "ojdbc11.jar");
  const classes = path.join(root, "jdbc", "classes");
  const bridgeClass = path.join(classes, "oracleide", "OracleBridge.class");
  return { jar, classes, bridgeClass };
}

function ensureBridgeBuilt() {
  const { jar, bridgeClass } = jdbcPaths();
  if (fs.existsSync(jar) && fs.existsSync(bridgeClass)) {
    return;
  }
  const setup = path.join(projectRoot(), "scripts", "setup-jdbc.mjs");
  const result = spawnSync(process.execPath, [setup], {
    cwd: projectRoot(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      [
        "JDBC bridge is not set up.",
        result.stderr || result.stdout || "",
        "Run: npm run setup:jdbc",
      ].join("\n"),
    );
  }
}

function handleLine(line: string) {
  let payload: BridgeResponse;
  try {
    payload = JSON.parse(line) as BridgeResponse;
  } catch {
    return;
  }
  const waiter = pending.get(payload.id);
  if (!waiter) return;
  pending.delete(payload.id);
  waiter.resolve(payload);
}

function cleanupBridge() {
  if (reader) {
    reader.close();
    reader = null;
  }
  bridge = null;
  connectedState = { connected: false, mode: "jdbc" };
}

function failAll(err: unknown) {
  for (const waiter of pending.values()) {
    waiter.reject(err);
  }
  pending.clear();
}

function request(
  body: Record<string, unknown> & { cmd: string },
  timeoutMs = 0,
): Promise<unknown> {
  if (!bridge?.stdin.writable) {
    throw new Error("JDBC bridge is not running");
  }

  const id = nextId++;
  return new Promise<unknown>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`JDBC bridge timed out on ${body.cmd}`));
      }, timeoutMs);
    }

    pending.set(id, {
      resolve: (value) => {
        if (timer) clearTimeout(timer);
        if (!value.ok) {
          reject(new Error(value.error || "JDBC bridge error"));
          return;
        }
        resolve(value.result);
      },
      reject: (reason) => {
        if (timer) clearTimeout(timer);
        reject(reason);
      },
    });

    bridge!.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
  });
}

async function ensureBridge(): Promise<void> {
  if (bridge && !bridge.killed) return;
  if (starting) return starting;

  starting = new Promise<void>((resolve, reject) => {
    try {
      ensureBridgeBuilt();
      const java = findJava();
      const { jar, classes } = jdbcPaths();
      const child = spawn(
        java,
        [
          "-Xms32m",
          "-Xmx256m",
          "-cp",
          `${classes}${path.delimiter}${jar}`,
          "oracleide.OracleBridge",
        ],
        {
          cwd: projectRoot(),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      bridge = child;
      reader = createInterface({ input: child.stdout });
      reader.on("line", handleLine);

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (err) => {
        failAll(err);
        cleanupBridge();
        reject(err);
      });

      child.on("exit", (code) => {
        const err = new Error(
          `JDBC bridge exited unexpectedly${code == null ? "" : ` (code ${code})`}${
            stderr ? `\n${stderr}` : ""
          }`,
        );
        failAll(err);
        cleanupBridge();
      });

      request({ cmd: "ping" }).then(() => resolve()).catch(reject);
    } catch (err) {
      reject(err);
    }
  }).finally(() => {
    starting = null;
  });

  return starting;
}

async function send(
  body: Record<string, unknown> & { cmd: string },
): Promise<unknown> {
  await ensureBridge();
  return request(body);
}

export async function connect(config: ConnectionConfig): Promise<ConnectionState> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const connectPromise = send({
    cmd: "connect",
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port || (config.tcps ? "2484" : "1521"),
    service: config.service,
    tcps: !!config.tcps,
  }) as Promise<ConnectionState>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error("Connection attempt timed out after 5 seconds"));
    }, 5000);
  });

  try {
    const result = await Promise.race([connectPromise, timeoutPromise]);
    if (timerId) clearTimeout(timerId);
    connectedState = {
      connected: true,
      user: result.user ?? config.user,
      connectString:
        result.connectString ??
        `${config.tcps ? "tcps://" : ""}${config.host}:${config.port || (config.tcps ? "2484" : "1521")}/${config.service}`,
      mode: "jdbc",
    };
    return connectedState;
  } catch (err) {
    if (timerId) clearTimeout(timerId);
    if (err instanceof Error && err.message.includes("timed out")) {
      if (bridge) {
        try {
          bridge.kill();
        } catch {
          // ignore
        }
        bridge = null;
      }
    }
    connectedState = { connected: false, mode: "jdbc" };
    throw err;
  }
}

export async function disconnect(): Promise<ConnectionState> {
  connectedState = { connected: false, mode: "jdbc" };
  if (bridge) {
    void request({ cmd: "disconnect" }, 1000).catch(() => {});
  }
  return connectedState;
}

export async function getStatus(): Promise<ConnectionState> {
  if (!bridge) {
    connectedState = { connected: false, mode: "jdbc" };
    return connectedState;
  }
  try {
    const result = (await send({ cmd: "status" })) as ConnectionState;
    connectedState = {
      connected: !!result.connected,
      user: result.user,
      connectString: result.connectString,
      mode: "jdbc",
    };
    return connectedState;
  } catch {
    try {
      await disconnect();
    } catch {
      // ignore
    }
    connectedState = { connected: false, mode: "jdbc" };
    return connectedState;
  }
}

export async function cancelQuery(): Promise<{ cancelled: boolean; message: string }> {
  if (!bridge) {
    return { cancelled: false, message: "No active database bridge" };
  }

  try {
    const res = (await send({ cmd: "cancel" })) as { cancelled?: boolean; message?: string };
    return {
      cancelled: res.cancelled ?? true,
      message: res.message ?? "Query execution cancelled by user",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { cancelled: true, message: `Query cancel sent (${msg})` };
  }
}

export async function execute(
  sql: string,
  maxRows = 1000,
  binds?: unknown[],
): Promise<QueryResult> {
  return (await send({
    cmd: "execute",
    sql,
    maxRows,
    binds: binds ?? [],
  })) as QueryResult;
}

export async function explain(
  sql: string,
  binds?: unknown[],
): Promise<QueryResult> {
  return (await send({
    cmd: "explain",
    sql,
    binds: binds ?? [],
  })) as QueryResult;
}

export async function commit(): Promise<void> {
  await send({ cmd: "commit" });
}

export async function rollback(): Promise<void> {
  await send({ cmd: "rollback" });
}

export async function listObjects(): Promise<DbObject[]> {
  return (await send({ cmd: "listObjects" })) as DbObject[];
}

export async function listColumns(objectName: string): Promise<DbColumn[]> {
  return (await send({ cmd: "listColumns", name: objectName })) as DbColumn[];
}

export async function listPrimaryKeys(objectName: string): Promise<string[]> {
  return (await send({ cmd: "listPrimaryKeys", name: objectName })) as string[];
}

export async function shutdownBridge(): Promise<void> {
  try {
    await disconnect();
  } catch {
    // ignore
  }
  if (bridge) {
    bridge.kill();
    cleanupBridge();
  }
}

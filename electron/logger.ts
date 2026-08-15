import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logDir = path.join(os.homedir(), "Library", "Logs", "DataStuff");
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // ignore
}

const logFile = path.join(logDir, "datastuff.log");

export function logMessage(level: "INFO" | "WARN" | "ERROR", message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    // ignore
  }
  if (level === "ERROR") {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}

export function getLogFilePath(): string {
  return logFile;
}

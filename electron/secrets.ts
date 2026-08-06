import { app, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const SECRET_FILE = "connection-password.enc";

function secretPath(): string {
  return path.join(app.getPath("userData"), SECRET_FILE);
}

export function isPasswordStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Encrypt with OS Keychain-backed key and write to userData. */
export async function savePassword(password: string): Promise<{ saved: boolean }> {
  if (!password) {
    await clearPassword();
    return { saved: true };
  }
  if (!isPasswordStorageAvailable()) {
    throw new Error("Secure password storage is unavailable on this system");
  }
  const encrypted = safeStorage.encryptString(password);
  await fs.writeFile(secretPath(), encrypted);
  return { saved: true };
}

export async function loadPassword(): Promise<string> {
  try {
    const encrypted = await fs.readFile(secretPath());
    if (!encrypted.length || !isPasswordStorageAvailable()) return "";
    return safeStorage.decryptString(encrypted);
  } catch {
    return "";
  }
}

export async function clearPassword(): Promise<void> {
  try {
    await fs.unlink(secretPath());
  } catch {
    // missing is fine
  }
}

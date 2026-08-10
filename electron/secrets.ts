import { app, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const SECRETS_MAP_FILE = "connection-passwords-map.enc";
const LEGACY_SECRET_FILE = "connection-password.enc";

function secretsMapPath(): string {
  return path.join(app.getPath("userData"), SECRETS_MAP_FILE);
}

function legacySecretPath(): string {
  return path.join(app.getPath("userData"), LEGACY_SECRET_FILE);
}

export function isPasswordStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Load all profile passwords from encrypted disk storage (backed by Apple Keychain / OS Keyring). */
async function loadAllPasswordsMap(): Promise<Record<string, string>> {
  if (!isPasswordStorageAvailable()) return {};
  try {
    const fileContent = await fs.readFile(secretsMapPath());
    if (!fileContent.length) return {};
    const jsonStr = safeStorage.decryptString(fileContent);
    return JSON.parse(jsonStr) as Record<string, string>;
  } catch {
    // If map file doesn't exist, check for legacy single password file and migrate
    try {
      const legacyEncrypted = await fs.readFile(legacySecretPath());
      if (legacyEncrypted.length) {
        const legacyPass = safeStorage.decryptString(legacyEncrypted);
        if (legacyPass) {
          return { default: legacyPass };
        }
      }
    } catch {
      // ignore
    }
    return {};
  }
}

/** Save all profile passwords encrypted with safeStorage (Apple Keychain). */
async function saveAllPasswordsMap(map: Record<string, string>): Promise<void> {
  if (!isPasswordStorageAvailable()) {
    throw new Error("Secure password storage is unavailable on this system");
  }
  const jsonStr = JSON.stringify(map);
  const encrypted = safeStorage.encryptString(jsonStr);
  await fs.writeFile(secretsMapPath(), encrypted);
}

/** Encrypt and save a password under a specific connection profile ID in Apple Keychain. */
export async function savePassword(
  password: string,
  profileId?: string,
): Promise<{ saved: boolean }> {
  const key = profileId && profileId.trim() ? profileId.trim() : "default";
  const map = await loadAllPasswordsMap();

  if (!password) {
    delete map[key];
  } else {
    map[key] = password;
  }

  await saveAllPasswordsMap(map);
  return { saved: true };
}

/** Load password associated with a connection profile ID from Apple Keychain. */
export async function loadPassword(profileId?: string): Promise<string> {
  const key = profileId && profileId.trim() ? profileId.trim() : "default";
  const map = await loadAllPasswordsMap();
  return map[key] || (key !== "default" ? map["default"] || "" : "");
}

/** Clear password associated with a connection profile ID from Apple Keychain. */
export async function clearPassword(profileId?: string): Promise<void> {
  const key = profileId && profileId.trim() ? profileId.trim() : "default";
  const map = await loadAllPasswordsMap();
  if (map[key]) {
    delete map[key];
    await saveAllPasswordsMap(map);
  }
}

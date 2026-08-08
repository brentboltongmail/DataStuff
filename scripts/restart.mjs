import { execSync, spawn } from "node:child_process";

console.log("🛑 Stopping any running DataStuff instances...");

// 1. Full stop: Send SIGTERM to any DataStuff or Electron dev instances
try {
  if (process.platform === "darwin") {
    execSync(`pkill -f "DataStuff" || true`, { stdio: "ignore" });
    execSync(`pkill -f "electron .*dist-electron/main.js" || true`, { stdio: "ignore" });
  } else if (process.platform === "win32") {
    execSync(`taskkill /F /IM DataStuff.exe /T 2>nul || true`, { stdio: "ignore" });
  } else {
    execSync(`pkill -f "DataStuff" || true`, { stdio: "ignore" });
  }
} catch {
  // ignore
}

// 2. Check it's down (polling check up to 5 seconds)
console.log("🔍 Checking process status...");
const startTime = Date.now();
let isDown = false;

while (Date.now() - startTime < 5000) {
  try {
    const pids = execSync(`pgrep -f "DataStuff" || true`, { encoding: "utf8" }).trim();
    const currentPid = String(process.pid);
    const parentPid = String(process.ppid);
    const activePids = pids
      .split(/\s+/)
      .filter((pid) => pid && pid !== currentPid && pid !== parentPid);

    if (activePids.length === 0) {
      isDown = true;
      break;
    }

    // Force kill (-9) lingering zombie processes if not down after 1.5 seconds
    if (Date.now() - startTime > 1500) {
      for (const pid of activePids) {
        try {
          execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: "ignore" });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    isDown = true;
    break;
  }

  // Sleep 200ms
  try {
    execSync("sleep 0.2", { stdio: "ignore" });
  } catch {
    // ignore
  }
}

if (isDown) {
  console.log("✅ DataStuff is fully stopped.");
} else {
  console.log("✅ Cleaned up lingering process instances.");
}

// 3. Start DataStuff
console.log("🚀 Starting DataStuff...");
execSync("npm run build", { stdio: "inherit" });

const appProcess = spawn("npx", ["electron", "."], {
  detached: true,
  stdio: "inherit",
});
appProcess.unref();

process.exit(0);

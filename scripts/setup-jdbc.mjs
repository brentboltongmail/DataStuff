import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const jdbcDir = path.join(root, "jdbc");
const libDir = path.join(jdbcDir, "lib");
const classesDir = path.join(jdbcDir, "classes");
const jarName = "ojdbc11.jar";
const jarPath = path.join(libDir, jarName);
const sourcePath = path.join(jdbcDir, "src", "oracleide", "OracleBridge.java");

const OJDBC_URL =
  "https://repo1.maven.org/maven2/com/oracle/database/jdbc/ojdbc11/23.7.0.25.01/ojdbc11-23.7.0.25.01.jar";

function findTool(name) {
  const candidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", name) : null,
    `/opt/homebrew/opt/openjdk/bin/${name}`,
    `/opt/homebrew/opt/openjdk@26/bin/${name}`,
    `/opt/homebrew/opt/openjdk@21/bin/${name}`,
    `/opt/homebrew/opt/openjdk@17/bin/${name}`,
    `/usr/local/opt/openjdk/bin/${name}`,
    name,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === name) {
      const which = spawnSync("which", [name], { encoding: "utf8" });
      if (which.status === 0 && which.stdout.trim()) {
        return which.stdout.trim();
      }
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore
        }
        reject(err);
      });
  });
}

async function main() {
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(classesDir, { recursive: true });

  const java = findTool("java");
  const javac = findTool("javac");
  if (!java || !javac) {
    console.error(
      "Java JDK not found. Install with: brew install openjdk\n" +
        "Then ensure javac is on PATH or JAVA_HOME is set.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(jarPath) || fs.statSync(jarPath).size < 1_000_000) {
    console.log(`Downloading ${jarName}…`);
    await download(OJDBC_URL, jarPath);
    console.log(`Saved ${jarPath}`);
  } else {
    console.log(`Using existing ${jarPath}`);
  }

  console.log("Compiling Oracle JDBC bridge…");
  const compile = spawnSync(
    javac,
    ["-cp", jarPath, "-d", classesDir, sourcePath],
    { encoding: "utf8" },
  );
  if (compile.status !== 0) {
    console.error(compile.stderr || compile.stdout);
    process.exit(compile.status ?? 1);
  }

  console.log("JDBC bridge ready.");
  console.log(`  java:  ${java}`);
  console.log(`  jar:   ${jarPath}`);
  console.log(`  class: ${path.join(classesDir, "oracleide", "OracleBridge.class")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

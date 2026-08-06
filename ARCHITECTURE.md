# DataStuff (Oracle IDE) - Architecture & Technology Stack

DataStuff (`oracle-ide`) is a macOS desktop SQL client designed for querying Oracle databases.

---

## 1. Technology Stack

### Desktop Container & Main Process
- **Electron (`v35.7.5`)**: Framework combining Node.js and Chromium to deliver a native desktop application interface.
- **Node.js (`v22+`)**: Manages the application lifecycle, native file system operations (`~/sql/*.sql` persistence), window creation, native OS dialogs, and child process management.
- **TypeScript (`v5.8.3`)**: Provides strict type safety across both the main process and the React renderer process.
- **Vite (`v6.3.3`) & `vite-plugin-electron`**: Powers fast development server execution, Hot Module Replacement (HMR), and production bundling.
- **Electron `safeStorage`**: Handles secure password encryption backed by the macOS Keychain.

### Database Engine & IPC Bridge
- **Java JDK (`17+`) & Oracle JDBC (`ojdbc11.jar`)**: Used instead of standard thin Node drivers (`node-oracledb`) to maintain full connection compatibility with legacy Oracle authentication verifiers (such as 10G password verifiers).
- **Custom Java Bridge (`OracleBridge.java`)**: A lightweight Java daemon that executes JDBC queries against Oracle and communicates with Node.js via line-delimited JSON RPC over `stdin`/`stdout`.

### User Interface (Renderer Process)
- **React (`v19.1.0`) & React DOM**: UI component rendering engine.
- **Monaco Editor (`@monaco-editor/react v4.7.0`)**: VS Code's editor engine for writing SQL statements, featuring syntax highlighting, cursor position tracking, and keybindings (`Cmd+Enter` execution).
- **Vanilla CSS**: Custom styling (`src/styles.css` and `src/themes.css`) featuring custom dark themes, macOS hidden-inset window controls, glassmorphic UI elements, and dynamic grid density scaling (Normal, Compact, Crammed).

---

## 2. Architecture Overview

The app follows a **3-tier process model**:

```
┌─────────────────────────────────────────────────────────┐
│               1. Renderer Process (React UI)            │
│  - Monaco Editor, Results Grid, Object Nav, SqlTabs     │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (contextBridge / preload.ts)
┌───────────────────────────▼─────────────────────────────┐
│             2. Electron Main Process (Node.js)          │
│  - Main window & dialog management                      │
│  - Disk persistence (~/sql/*.sql workspace pages)       │
│  - Child process manager for Java JDBC bridge           │
└───────────────────────────┬─────────────────────────────┘
                            │ stdio (JSON Lines RPC over stdin/stdout)
┌───────────────────────────▼─────────────────────────────┐
│           3. Java JDBC Subprocess (OracleBridge)        │
│  - ojdbc11.jar Oracle Thin Driver                       │
│  - Active connection state & transaction management     │
└───────────────────────────┬─────────────────────────────┘
                            │ Oracle Net (Easy Connect TCP/TCPS)
┌───────────────────────────▼─────────────────────────────┐
│                 Oracle Database Server                  │
└─────────────────────────────────────────────────────────┘
```

### Key Components

1. **Renderer Layer (`src/App.tsx`)**:
   - Manages UI state for SQL tabs, active query results, transaction state (uncommitted DML tracking), history logs, and schema objects.
   - Communicates with the Electron Main process via standard `ipcRenderer` invocations exposed through `contextBridge` in `electron/preload.ts`.

2. **Electron Main Layer (`electron/main.ts`)**:
   - Registers IPC handlers (`oracle:connect`, `oracle:execute`, `workspace:save`, `secrets:savePassword`).
   - Manages automatic document persistence under `~/sql/*.sql` via `electron/sqlPages.ts`.

3. **JDBC Bridge Subprocess (`electron/oracle.ts` & `jdbc/src/oracleide/OracleBridge.java`)**:
   - Node spawns `java -cp ... oracleide.OracleBridge` as a background process.
   - Requests (`execute`, `commit`, `rollback`, `listObjects`, `explain`) are sent as JSON strings over `stdin`.
   - `OracleBridge.java` processes requests against a live `java.sql.Connection` with **auto-commit disabled** and writes JSON responses back over `stdout`.

4. **Automated Setup Script (`scripts/setup-jdbc.mjs`)**:
   - Downloads `ojdbc11.jar` into `jdbc/lib/` if missing and compiles `OracleBridge.java` into `jdbc/classes/` using `javac` prior to running `dev` or `build`.

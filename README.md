# Oracle IDE

Simple macOS desktop IDE for querying Oracle: run SQL, view results in a grid, and commit or rollback transactions.

Uses **Oracle JDBC** (`ojdbc11.jar`) via a small local Java bridge — this supports older 10G password verifiers (the NJS-116 case that broke node-oracledb Thin mode).

## Features

- Connect with Easy Connect (`host:port/service`) over JDBC
- Multiple SQL tabs (**Cmd+T**); double-click a tab name to rename; files live in `~/sql/*.sql`
- Statement history (Results / History bottom panel; click to restore)
- Object browser for current-schema **tables**, **views**, and **synonyms**
- SQL editor (Monaco): **Ctrl+Enter** / **Cmd+Enter** runs the statement under the cursor (blank lines separate statements; semicolons optional)
- Results grid for `SELECT`
- **Export CSV** for the current result set
- `INSERT` / `UPDATE` / `DELETE` with **auto-commit off**
- Explicit **Commit** and **Rollback**

## Requirements

- macOS
- Node.js 20+
- JDK 17+ (`brew install openjdk`)
- Network access to an Oracle database

## Setup

```bash
brew install openjdk   # if needed
npm install
npm run setup:jdbc     # downloads ojdbc11.jar + compiles the bridge
npm run dev
```

`setup:jdbc` runs automatically before `dev` / `build`.

> If you see `Electron failed to install correctly`, run:
> `npm approve-scripts electron && node node_modules/electron/install.js`

## Connect

| Field   | Example        |
|---------|----------------|
| User    | `scott`        |
| Password| `tiger`        |
| Host    | `localhost`    |
| Port    | `1521` (or `2484` for TCPS) |
| Service | `ORCLPDB1`     |
| TCPS    | optional TLS   |

JDBC URL: `jdbc:oracle:thin:@//host:port/service`  
With **TCPS** checked: `jdbc:oracle:thin:@tcps://host:port/service` (port defaults toward `2484`). The DB listener must accept TCPS, and Java must trust the server certificate.

## Transactions

DML does **not** auto-commit. After inserts/updates/deletes:

1. **Commit** to persist
2. **Rollback** to undo

## Build

```bash
npm run build
npm start
```

## Notes

- Query pages auto-save into `~/sql/*.sql` about **5 seconds** after edits (and immediately on blur/quit). Double-click a tab name to rename the file.
- Separate statements with a blank line. Semicolons are optional.
- If text is selected, the selection is run instead.
- Result sets are capped by **Max rows** in the toolbar (default **1000**, max 100,000).
- Toggle **Grid: Normal → Compact → Crammed** for denser results (Crammed tilts headers 40° and sizes columns from data).
- JDBC artifacts live under `jdbc/lib` (jar) and `jdbc/classes` (compiled bridge).

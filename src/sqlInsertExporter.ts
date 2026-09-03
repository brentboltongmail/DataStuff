import type { QueryColumn, QueryResult } from "./types";
import { isRowIdColumn } from "./editableQuery.ts";

export interface GenerateInsertOptions {
  tableName: string;
  includeColumns?: boolean;
  includeCommit?: boolean;
  batchCommitSize?: number;
}

/**
 * Formats a target table name for an INSERT statement.
 * Preserves schema.table notation (e.g. HR.EMPLOYEES), double quotes if already quoted,
 * and quotes names only if they contain spaces or special characters.
 */
export function formatTargetTableName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "TARGET_TABLE";

  // Handle schema.table or multi-part names
  if (trimmed.includes(".")) {
    return trimmed
      .split(".")
      .map((part) => {
        const p = part.trim();
        if (/^".*"$/.test(p)) return p;
        if (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(p)) return p;
        return `"${p.replace(/"/g, '""')}"`;
      })
      .join(".");
  }

  if (/^".*"$/.test(trimmed)) return trimmed;
  if (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/**
 * Formats a column name for an INSERT statement.
 * Standard Oracle identifiers (uppercase, numbers, _, $, #) stay unquoted.
 * Identifiers with lowercase letters, spaces, or reserved chars are double quoted.
 */
export function formatColumnIdentifier(name: string): string {
  const trimmed = name.trim();
  if (/^".*"$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[A-Z_][A-Z0-9_$#]*$/.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/**
 * Formats a single value into a valid SQL literal based on value and optional column type.
 */
export function formatSqlValue(value: unknown, colType?: string): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const typeUpper = (colType || "").toUpperCase();

  // 1. Numbers
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }

  // 2. Booleans
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  // 3. Date instances
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "NULL";
    const iso = value.toISOString();
    const hasMillis = value.getUTCMilliseconds() !== 0;
    const hasTime =
      hasMillis ||
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0;

    if (hasMillis) {
      const formatted = iso.replace("T", " ").replace("Z", "");
      return `TO_TIMESTAMP('${formatted}', 'YYYY-MM-DD HH24:MI:SS.FF3')`;
    }
    if (hasTime) {
      const formatted = iso.replace("T", " ").substring(0, 19);
      return `TO_DATE('${formatted}', 'YYYY-MM-DD HH24:MI:SS')`;
    }
    return `TO_DATE('${iso.substring(0, 10)}', 'YYYY-MM-DD')`;
  }

  // 4. Strings & objects
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  // If column type is explicitly numeric, render unquoted number if valid
  const isNumericCol =
    typeUpper.includes("NUMBER") ||
    typeUpper.includes("FLOAT") ||
    typeUpper.includes("INT") ||
    typeUpper.includes("DOUBLE") ||
    typeUpper.includes("DECIMAL") ||
    typeUpper.includes("NUMERIC");

  if (isNumericCol) {
    const trimmed = str.trim();
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      return trimmed;
    }
  }

  // If column is explicitly RAW / binary hex
  if (typeUpper === "RAW" && /^[0-9a-fA-F]+$/.test(str.trim())) {
    return `HEXTORAW('${str.trim().toUpperCase()}')`;
  }

  // If column is string/char/clob, always escape as string literal even if it looks like a date
  const isStringCol =
    typeUpper.includes("VARCHAR") ||
    typeUpper.includes("CHAR") ||
    typeUpper.includes("CLOB") ||
    typeUpper.includes("TEXT");

  if (isStringCol) {
    return `'${str.replace(/'/g, "''")}'`;
  }

  // Date / Timestamp string handling (for DATE, TIMESTAMP, or untyped columns)
  const isDateCol = typeUpper.includes("DATE");
  const isTimestampCol = typeUpper.includes("TIMESTAMP");
  const trimmed = str.trim();

  if (isDateCol || isTimestampCol || !colType) {
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `TO_DATE('${trimmed}', 'YYYY-MM-DD')`;
    }
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
      return `TO_DATE('${trimmed.replace(/\//g, "-")}', 'YYYY-MM-DD')`;
    }
    // YYYY-MM-DD HH24:MI:SS
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      const normalized = trimmed.replace("T", " ");
      return `TO_DATE('${normalized}', 'YYYY-MM-DD HH24:MI:SS')`;
    }
    // YYYY-MM-DD HH24:MI:SS.FF
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\.\d+$/.test(trimmed)) {
      const normalized = trimmed.replace("T", " ");
      return `TO_TIMESTAMP('${normalized}', 'YYYY-MM-DD HH24:MI:SS.FF')`;
    }
    // ISO with timezone (e.g. 2026-09-03T15:17:15.123Z or +00:00)
    if (
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?\s*(?:Z|[+-]\d{2}:?\d{2})$/i.test(
        trimmed,
      )
    ) {
      const clean = trimmed.replace("T", " ").replace(/Z$/i, "");
      if (clean.includes(".")) {
        return `TO_TIMESTAMP('${clean}', 'YYYY-MM-DD HH24:MI:SS.FF')`;
      }
      return `TO_DATE('${clean}', 'YYYY-MM-DD HH24:MI:SS')`;
    }
  }

  // Default string literal with doubled single quotes
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Filter out ROWID columns so they are never exported into INSERT statements.
 */
export function getExportableColumns(columns: QueryColumn[]): { col: QueryColumn; index: number }[] {
  return columns
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => !isRowIdColumn(col.name));
}

/**
 * Generates SQL INSERT statements from a QueryResult.
 */
export function generateInsertStatements(
  result: QueryResult,
  options: GenerateInsertOptions,
): string {
  const {
    tableName,
    includeColumns = true,
    includeCommit = true,
    batchCommitSize = 1000,
  } = options;

  const targetTable = formatTargetTableName(tableName);
  const cols = getExportableColumns(result.columns);

  if (cols.length === 0) {
    return "-- No exportable columns found in query result.\n";
  }

  const lines: string[] = [];
  lines.push(`-- Exported from DataStuff`);
  lines.push(`-- Target Table: ${targetTable}`);
  lines.push(`-- Total Rows: ${result.rows.length}`);
  lines.push(
    `-- Exported At: ${new Date().toISOString().replace("T", " ").replace(/\..+$/, "")} UTC`,
  );
  lines.push("");
  lines.push("SET DEFINE OFF;");
  lines.push("");

  const columnClause = includeColumns
    ? ` (${cols.map(({ col }) => formatColumnIdentifier(col.name)).join(", ")})`
    : "";

  const insertPrefix = `INSERT INTO ${targetTable}${columnClause} VALUES (`;

  for (let r = 0; r < result.rows.length; r++) {
    const row = result.rows[r];
    const valueParts = cols.map(({ col, index }) => {
      const val = row ? row[index] : null;
      return formatSqlValue(val, col.type);
    });

    lines.push(`${insertPrefix}${valueParts.join(", ")});`);

    if (
      includeCommit &&
      batchCommitSize > 0 &&
      (r + 1) % batchCommitSize === 0 &&
      r + 1 < result.rows.length
    ) {
      lines.push("COMMIT;");
      lines.push("");
    }
  }

  if (includeCommit) {
    lines.push("");
    lines.push("COMMIT;");
  }

  return lines.join("\n") + "\n";
}

/**
 * Generates a preview snippet of the first few INSERT statements.
 */
export function generateInsertStatementsPreview(
  result: QueryResult,
  options: GenerateInsertOptions,
  previewCount = 3,
): string {
  const targetTable = formatTargetTableName(options.tableName);
  const cols = getExportableColumns(result.columns);

  if (cols.length === 0) {
    return "-- No exportable columns found.";
  }

  const columnClause = options.includeColumns !== false
    ? ` (${cols.map(({ col }) => formatColumnIdentifier(col.name)).join(", ")})`
    : "";

  const insertPrefix = `INSERT INTO ${targetTable}${columnClause} VALUES (`;
  const lines: string[] = [];

  const count = Math.min(result.rows.length, previewCount);
  if (count === 0) {
    lines.push(`${insertPrefix}/* <no rows in result set> */);`);
  } else {
    for (let r = 0; r < count; r++) {
      const row = result.rows[r];
      const valueParts = cols.map(({ col, index }) => {
        const val = row ? row[index] : null;
        return formatSqlValue(val, col.type);
      });
      lines.push(`${insertPrefix}${valueParts.join(", ")});`);
    }
    if (result.rows.length > count) {
      lines.push(`-- ... and ${result.rows.length - count} more row${result.rows.length - count === 1 ? "" : "s"}`);
    }
  }

  if (options.includeCommit !== false) {
    lines.push("COMMIT;");
  }

  return lines.join("\n");
}

import type { QueryResult } from "./types";

function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function resultToCsv(result: QueryResult): string {
  const header = result.columns.map((col) => formatCsvCell(col.name)).join(",");
  const lines = result.rows.map((row) =>
    row.map((cell) => formatCsvCell(cell)).join(","),
  );
  return [header, ...lines].join("\n");
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function isNullCell(value: unknown): boolean {
  return value === null || value === undefined;
}

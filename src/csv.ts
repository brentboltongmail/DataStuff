import type { QueryResult } from "./types";

function formatDateString(val: string): string {
  let s = val;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace("T", " ").replace(/\.000Z$/, "").replace(/Z$/, "");
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    s = s.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1/$2/$3");
  }
  return s;
}

function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) {
    text = formatDateString(value.toISOString());
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = formatDateString(String(value));
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
  if (value instanceof Date) return formatDateString(value.toISOString());
  if (typeof value === "string") return formatDateString(value);
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

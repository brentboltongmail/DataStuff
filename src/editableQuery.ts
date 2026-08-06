/** Detect a single table/view/synonym target from a simple SELECT. */
export function detectSingleSourceTable(sql: string): string | null {
  const cleaned = sql
    .replace(/^\s*\/\*[\s\S]*?\*\//, "")
    .replace(/^\s*--[^\n]*/gm, "")
    .trim();

  if (!/^(select|with)\b/i.test(cleaned)) return null;
  if (/\bjoin\b/i.test(cleaned)) return null;

  const fromMatch = cleaned.match(
    /\bfrom\s+((?:"[^"]+"|[a-zA-Z0-9_$#]+)(?:\s*\.\s*(?:"[^"]+"|[a-zA-Z0-9_$#]+))?)/i,
  );
  if (!fromMatch) return null;

  // Reject obvious multi-from patterns like comma joins: FROM a, b
  const afterFrom = cleaned.slice(fromMatch.index! + fromMatch[0].length);
  const nextClause = afterFrom.match(
    /^\s*,|\b(?:where|group|having|order|fetch|offset|union|minus|intersect|connect|start|model)\b/i,
  );
  if (nextClause?.[0]?.trim() === ",") return null;

  return fromMatch[1].replace(/\s+/g, "");
}

export function hasRowIdColumn(columns: { name: string }[]): boolean {
  return columns.some((col) => isRowIdColumn(col.name));
}

export function isRowIdColumn(name: string): boolean {
  const n = name.replace(/^"+|"+$/g, "").toUpperCase();
  return n === "ROWID" || n === "ORA$ROWID";
}

/** Wrap a SELECT so Oracle ROWID is available for later UPDATEs. */
export function injectRowId(sql: string): string {
  const cleaned = sql.replace(/;+\s*$/, "").trim();
  if (/\browid\b/i.test(cleaned)) return cleaned;
  return `SELECT ROWID AS "ORA$ROWID", q.* FROM (${cleaned}) q`;
}

export function quoteIdent(name: string): string {
  if (name.startsWith('"') && name.endsWith('"')) return name;
  if (/^[A-Z][A-Z0-9_$#]*$/.test(name)) return name;
  if (/^[a-zA-Z][a-zA-Z0-9_$#]*$/.test(name)) return name.toUpperCase();
  return `"${name.replace(/"/g, '""')}"`;
}

export function buildUpdate(
  table: string,
  column: string,
  newValue: unknown,
  rowId: string | undefined,
  pkColumns: { name: string; value: unknown }[] | undefined,
  columnType?: string,
): { sql: string; binds: unknown[] } {
  const tableSql = table
    .split(".")
    .map((part) => quoteIdent(part.replace(/^"+|"+$/g, "")))
    .join(".");
  const col = quoteIdent(column.replace(/^"+|"+$/g, ""));
  const upperType = (columnType ?? "").toUpperCase();
  const isDateType =
    upperType.includes("DATE") || upperType.includes("TIMESTAMP");

  let valExpr = "?";
  let bindValue = newValue;

  if (isDateType && typeof newValue === "string" && newValue.trim() !== "") {
    const val = newValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      valExpr = "TO_DATE(?, 'YYYY-MM-DD')";
      bindValue = val;
    } else if (
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(val)
    ) {
      valExpr = "TO_TIMESTAMP(?, 'YYYY-MM-DD HH24:MI:SS.FF')";
      bindValue = val.replace("T", " ");
    } else if (/^\d{2}-[A-Z]{3}-\d{2,4}$/i.test(val)) {
      valExpr = "TO_DATE(?, 'DD-MON-YYYY')";
      bindValue = val.toUpperCase();
    } else {
      valExpr = "TO_DATE(?, 'YYYY-MM-DD HH24:MI:SS')";
      bindValue = val;
    }
  }

  if (rowId) {
    return {
      sql: `UPDATE ${tableSql} SET ${col} = ${valExpr} WHERE ROWID = ?`,
      binds: [bindValue, rowId],
    };
  }

  if (pkColumns && pkColumns.length > 0) {
    const where = pkColumns
      .map((pk) => `${quoteIdent(pk.name.replace(/^"+|"+$/g, ""))} = ?`)
      .join(" AND ");
    return {
      sql: `UPDATE ${tableSql} SET ${col} = ${valExpr} WHERE ${where}`,
      binds: [bindValue, ...pkColumns.map((pk) => pk.value)],
    };
  }

  throw new Error("Cannot update row without ROWID or primary key");
}

/** Parse edited cell text into a bind value. Empty / NULL → null. */
export function parseEditValue(text: string, original: unknown): unknown {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NULL") {
    return null;
  }
  if (
    typeof original === "number" ||
    (original != null &&
      /^-?\d+(\.\d+)?$/.test(String(original)) &&
      /^-?\d+(\.\d+)?$/.test(trimmed))
  ) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return text;
}

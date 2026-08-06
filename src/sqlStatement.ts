/** Split SQL into statements separated by one or more blank lines. */

function isBlank(line: string): boolean {
  return line.trim() === "";
}

/**
 * Return the SQL statement under the cursor.
 * Statements are separated by empty lines. Trailing semicolons are optional
 * and are stripped before execution.
 *
 * @param sql full editor text
 * @param cursorLine 1-based line number (Monaco style)
 */
export function statementAtCursor(sql: string, cursorLine: number): string {
  const lines = sql.split(/\r?\n/);
  if (lines.length === 0) return "";

  let idx = Math.min(Math.max(cursorLine - 1, 0), lines.length - 1);

  // If the cursor is on a blank line, prefer the statement above, else below.
  if (isBlank(lines[idx] ?? "")) {
    let up = idx;
    while (up > 0 && isBlank(lines[up] ?? "")) up -= 1;
    if (!isBlank(lines[up] ?? "")) {
      idx = up;
    } else {
      let down = idx;
      while (down < lines.length - 1 && isBlank(lines[down] ?? "")) down += 1;
      idx = down;
    }
  }

  if (isBlank(lines[idx] ?? "")) return "";

  let start = idx;
  while (start > 0 && !isBlank(lines[start - 1] ?? "")) {
    start -= 1;
  }

  let end = idx;
  while (end < lines.length - 1 && !isBlank(lines[end + 1] ?? "")) {
    end += 1;
  }

  return lines
    .slice(start, end + 1)
    .join("\n")
    .trim()
    .replace(/;+\s*$/g, "");
}

/** Prefer a non-empty selection; otherwise the blank-line statement at the cursor. */
export function sqlToExecute(
  sql: string,
  cursorLine: number,
  selectedText?: string | null,
): string {
  const selected = selectedText?.trim() ?? "";
  if (selected) {
    return selected.replace(/;+\s*$/g, "");
  }
  return statementAtCursor(sql, cursorLine);
}

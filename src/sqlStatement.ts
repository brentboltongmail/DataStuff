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

/** Prefer a non-empty selection; otherwise the statement at the cursor separated by blank lines or semicolons. */
export function statementBlockAtCursor(
  sql: string,
  cursorLine: number,
  selectedText?: string | null,
): { statement: string; startLine: number } {
  const selected = selectedText?.trim() ?? "";
  if (selected) {
    return { statement: selected.replace(/;+\s*$/g, ""), startLine: Math.max(1, cursorLine) };
  }

  const lines = sql.split(/\r?\n/);
  if (lines.length === 0) return { statement: "", startLine: 1 };

  let idx = Math.min(Math.max(cursorLine - 1, 0), lines.length - 1);

  // If the cursor is on a blank line, find the closest non-blank line
  if (isBlank(lines[idx] ?? "")) {
    let up = idx;
    while (up > 0 && isBlank(lines[up] ?? "")) up -= 1;
    if (!isBlank(lines[up] ?? "")) {
      idx = up;
    } else {
      let down = idx;
      while (down < lines.length - 1 && isBlank(lines[down] ?? "")) down += 1;
      if (!isBlank(lines[down] ?? "")) {
        idx = down;
      }
    }
  }

  if (isBlank(lines[idx] ?? "")) return { statement: "", startLine: 1 };

  // Expand start upwards until blank line or preceding line ends with ';'
  let start = idx;
  while (start > 0) {
    const prevLine = lines[start - 1] ?? "";
    if (isBlank(prevLine) || prevLine.trim().endsWith(";")) {
      break;
    }
    start -= 1;
  }

  // Expand end downwards until blank line or line ends with ';'
  let end = idx;
  while (end < lines.length - 1) {
    const currLine = lines[end] ?? "";
    if (currLine.trim().endsWith(";")) {
      break;
    }
    const nextLine = lines[end + 1] ?? "";
    if (isBlank(nextLine)) {
      break;
    }
    end += 1;
  }

  const statement = lines
    .slice(start, end + 1)
    .join("\n")
    .trim()
    .replace(/;+\s*$/g, "");

  return { statement, startLine: start + 1 };
}

/** Prefer a non-empty selection; otherwise the blank-line statement at the cursor. */
export function sqlToExecute(
  sql: string,
  cursorLine: number,
  selectedText?: string | null,
): string {
  return statementBlockAtCursor(sql, cursorLine, selectedText).statement;
}

export interface SqlStatementBlock {
  id: string;
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Parse all SQL statement blocks with their 1-based start and end line ranges.
 */
export function parseSqlStatements(sql: string): SqlStatementBlock[] {
  if (!sql || !sql.trim()) return [];

  const lines = sql.split(/\r?\n/);
  const blocks: SqlStatementBlock[] = [];
  let currentLines: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlankLine = line.trim() === "";

    if (isBlankLine) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text) {
          blocks.push({
            id: `stmt-${startLine}-${i}`,
            text: text.replace(/;+\s*$/g, ""),
            startLine,
            endLine: i,
          });
        }
        currentLines = [];
      }
    } else {
      if (currentLines.length === 0) {
        startLine = i + 1;
      }
      currentLines.push(line);

      if (line.trim().endsWith(";")) {
        const text = currentLines.join("\n").trim();
        if (text) {
          blocks.push({
            id: `stmt-${startLine}-${i + 1}`,
            text: text.replace(/;+\s*$/g, ""),
            startLine,
            endLine: i + 1,
          });
        }
        currentLines = [];
      }
    }
  }

  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text) {
      blocks.push({
        id: `stmt-${startLine}-${lines.length}`,
        text: text.replace(/;+\s*$/g, ""),
        startLine,
        endLine: lines.length,
      });
    }
  }

  return blocks;
}

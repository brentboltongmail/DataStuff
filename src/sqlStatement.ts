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

/** Prefer a non-empty selection; otherwise the blank-line statement at the cursor with startLine info. */
export function statementBlockAtCursor(
  sql: string,
  cursorLine: number,
  selectedText?: string | null,
): { statement: string; startLine: number } {
  const selected = selectedText?.trim() ?? "";
  if (selected) {
    return { statement: selected.replace(/;+\s*$/g, ""), startLine: Math.max(1, cursorLine) };
  }

  const blocks = parseSqlStatements(sql);
  if (blocks.length === 0) return { statement: "", startLine: 1 };

  const match = blocks.find((b) => cursorLine >= b.startLine && cursorLine <= b.endLine);
  if (match) {
    return { statement: match.text, startLine: match.startLine };
  }

  let closest = blocks[0];
  let minDiff = Math.abs(cursorLine - blocks[0].startLine);
  for (const b of blocks) {
    const diff = Math.min(Math.abs(cursorLine - b.startLine), Math.abs(cursorLine - b.endLine));
    if (diff < minDiff) {
      minDiff = diff;
      closest = b;
    }
  }
  return { statement: closest.text, startLine: closest.startLine };
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

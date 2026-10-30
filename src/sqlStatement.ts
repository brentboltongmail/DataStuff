/** Split SQL into statements separated by one or more blank lines or PL/SQL boundaries. */

function isBlank(line: string): boolean {
  return line.trim() === "";
}

/** Check if SQL text is a PL/SQL block (DECLARE...BEGIN...END or BEGIN...END). */
export function isPlSqlBlock(sql: string): boolean {
  if (!sql) return false;
  const stripped = sql.replace(/^\s*(\/\*[\s\S]*?\*\/|--[^\n]*\s*)+/g, "").trim();
  return /^(DECLARE|BEGIN)\b/i.test(stripped);
}

/** Check if SQL text contains an explicit END keyword outside comments and strings. */
export function hasExplicitEnd(sql: string): boolean {
  const stripped = sql
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
  return /\bEND\b/i.test(stripped);
}

/**
 * Clean statement text before execution:
 * For PL/SQL blocks, strips trailing slash ('/'), ensures trailing semicolon and END; are present.
 * For standard SQL statements, strips trailing semicolons and slashes.
 */
export function cleanSqlStatement(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) return "";

  if (isPlSqlBlock(cleaned)) {
    cleaned = cleaned.replace(/\s*\/\s*$/g, "").trim();
    if (!hasExplicitEnd(cleaned)) {
      if (!cleaned.endsWith(";")) cleaned += ";";
      cleaned += "\nEND;";
    } else if (!cleaned.endsWith(";")) {
      cleaned += ";";
    }
    return cleaned;
  }

  return cleaned.replace(/;+\s*$/g, "").replace(/\s*\/\s*$/g, "").trim();
}

/**
 * Return the SQL statement under the cursor.
 *
 * @param sql full editor text
 * @param cursorLine 1-based line number (Monaco style)
 */
export function statementAtCursor(sql: string, cursorLine: number): string {
  return statementBlockAtCursor(sql, cursorLine).statement;
}

/** Prefer a non-empty selection; otherwise the statement block at cursor. */
export function statementBlockAtCursor(
  sql: string,
  cursorLine: number,
  selectedText?: string | null,
): { statement: string; startLine: number } {
  const selected = selectedText?.trim() ?? "";
  if (selected) {
    return { statement: cleanSqlStatement(selected), startLine: Math.max(1, cursorLine) };
  }

  const blocks = parseSqlStatements(sql);
  if (blocks.length === 0) return { statement: "", startLine: 1 };

  for (const block of blocks) {
    if (cursorLine >= block.startLine && cursorLine <= block.endLine) {
      return { statement: block.text, startLine: block.startLine };
    }
  }

  let closest = blocks[0];
  let minDistance = Infinity;
  for (const block of blocks) {
    const dist =
      cursorLine < block.startLine
        ? block.startLine - cursorLine
        : cursorLine > block.endLine
        ? cursorLine - block.endLine
        : 0;
    if (dist < minDistance) {
      minDistance = dist;
      closest = block;
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
 * Supports standard SQL statements (ended by ';' or separated by blank lines)
 * and PL/SQL anonymous blocks (DECLARE/BEGIN...END; optionally followed by '/').
 */
export function parseSqlStatements(sql: string): SqlStatementBlock[] {
  if (!sql || !sql.trim()) return [];

  const lines = sql.split(/\r?\n/);
  const blocks: SqlStatementBlock[] = [];
  let currentLines: string[] = [];
  let startLine = 1;
  let inPlSql = false;
  let plSqlStarted = false;
  let plSqlDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines or standalone '/' when not in a statement block
    if (currentLines.length === 0 && (trimmed === "" || trimmed === "/")) {
      continue;
    }

    if (currentLines.length === 0) {
      startLine = i + 1;
      const cleanFirst = trimmed.replace(/\/\*[\s\S]*?\*\/|--.*$/g, "").trim();
      if (/^(DECLARE|BEGIN)\b/i.test(cleanFirst)) {
        inPlSql = true;
        plSqlStarted = false;
        plSqlDepth = 0;
      } else {
        inPlSql = false;
      }
    }

    currentLines.push(rawLine);

    if (inPlSql) {
      const stripped = rawLine
        .replace(/'(?:''|[^'])*'/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--.*$/, " ");

      const matches = stripped.match(/\b(BEGIN|CASE|END)\b/gi);
      if (matches) {
        for (const m of matches) {
          const up = m.toUpperCase();
          if (up === "BEGIN" || up === "CASE") {
            plSqlDepth++;
            plSqlStarted = true;
          } else if (up === "END") {
            plSqlDepth--;
          }
        }
      }

      const isSlash = trimmed === "/";
      const endsWithSemicolon = trimmed.endsWith(";") || /;\s*--.*$/.test(trimmed);
      if (isSlash || (plSqlStarted && plSqlDepth <= 0 && endsWithSemicolon)) {
        let endLine = i + 1;
        // If the very next line is a standalone slash '/', absorb it into this block
        if (!isSlash && i + 1 < lines.length && lines[i + 1].trim() === "/") {
          currentLines.push(lines[i + 1]);
          i++;
          endLine = i + 1;
        }

        const text = cleanSqlStatement(currentLines.join("\n"));
        if (text) {
          blocks.push({
            id: `stmt-${startLine}-${endLine}`,
            text,
            startLine,
            endLine,
          });
        }
        currentLines = [];
        inPlSql = false;
        plSqlStarted = false;
        plSqlDepth = 0;
      }
    } else {
      const isBlankLine = trimmed === "";
      if (isBlankLine) {
        if (currentLines.length > 0) {
          currentLines.pop(); // Remove the blank line itself
          const text = cleanSqlStatement(currentLines.join("\n"));
          if (text) {
            blocks.push({
              id: `stmt-${startLine}-${i}`,
              text,
              startLine,
              endLine: i,
            });
          }
          currentLines = [];
        }
      } else if (trimmed.endsWith(";")) {
        let endLine = i + 1;
        if (i + 1 < lines.length && lines[i + 1].trim() === "/") {
          currentLines.push(lines[i + 1]);
          i++;
          endLine = i + 1;
        }
        const text = cleanSqlStatement(currentLines.join("\n"));
        if (text) {
          blocks.push({
            id: `stmt-${startLine}-${endLine}`,
            text,
            startLine,
            endLine,
          });
        }
        currentLines = [];
      }
    }
  }

  if (currentLines.length > 0) {
    const text = cleanSqlStatement(currentLines.join("\n"));
    if (text) {
      blocks.push({
        id: `stmt-${startLine}-${lines.length}`,
        text,
        startLine,
        endLine: lines.length,
      });
    }
  }

  return blocks;
}

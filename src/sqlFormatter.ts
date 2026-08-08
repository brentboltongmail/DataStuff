/**
 * Custom SQL Formatter enforcing:
 * - 4-space indentations for clause items
 * - Major SQL keywords on new lines
 * - JOIN table ON condition all on a single line (e.g. LEFT JOIN departments d ON e.dept_id = d.dept_id)
 * - Subquery opening '(' on its own new line (inner query on next line indented +4 spaces)
 * - Functions like TRUNC(...), NVL(...), COUNT(...), TO_DATE(...) kept inline on a single line
 * - BETWEEN ... AND ... kept on the same line
 * - Closing ')' for subqueries on its own line aligned with opening parenthesis
 */

const MAJOR_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "UNION ALL",
  "UNION",
  "INTERSECT",
  "MINUS",
  "EXCEPT",
  "INSERT INTO",
  "UPDATE",
  "DELETE FROM",
  "SET",
  "VALUES",
  "CONNECT BY",
  "START WITH",
  "WITH",
];

const JOIN_KEYWORDS = [
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "JOIN",
];

const LOGICAL_OPERATORS = ["AND", "OR"];

const SUBQUERY_KEYWORDS = ["SELECT", "WITH", "INSERT", "UPDATE", "DELETE"];

export function formatSql(sql: string): string {
  if (!sql || !sql.trim()) return sql;

  const trimmed = sql.trim();
  const hasSemicolon = trimmed.endsWith(";");
  const cleanSql = hasSemicolon ? trimmed.slice(0, -1).trim() : trimmed;

  const tokens: string[] = [];
  let currentToken = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];
    const nextChar = cleanSql[i + 1] || "";

    // Handle comments
    if (inLineComment) {
      currentToken += char;
      if (char === "\n") {
        tokens.push(currentToken);
        currentToken = "";
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      currentToken += char;
      if (char === "*" && nextChar === "/") {
        currentToken += "/";
        i++;
        tokens.push(currentToken);
        currentToken = "";
        inBlockComment = false;
      }
      continue;
    }

    if (!inString) {
      if (char === "-" && nextChar === "-") {
        if (currentToken.trim()) tokens.push(currentToken.trim());
        currentToken = "--";
        i++;
        inLineComment = true;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        if (currentToken.trim()) tokens.push(currentToken.trim());
        currentToken = "/*";
        i++;
        inBlockComment = true;
        continue;
      }
    }

    // Handle string literals
    if (char === "'" || char === '"') {
      if (!inString) {
        if (currentToken.trim()) tokens.push(currentToken.trim());
        currentToken = char;
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        currentToken += char;
        tokens.push(currentToken);
        currentToken = "";
        inString = false;
      } else {
        currentToken += char;
      }
      continue;
    }

    if (inString) {
      currentToken += char;
      continue;
    }

    // Delimiters
    if (char === "(" || char === ")" || char === ",") {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
      }
      tokens.push(char);
      currentToken = "";
      continue;
    }

    // Whitespace
    if (/\s/.test(char)) {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
        currentToken = "";
      }
      continue;
    }

    currentToken += char;
  }

  if (currentToken.trim()) {
    tokens.push(currentToken.trim());
  }

  // Combine multi-word keywords
  const normalizedTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const upper = t.toUpperCase();
    const nextT = (tokens[i + 1] || "").toUpperCase();
    const nextNextT = (tokens[i + 2] || "").toUpperCase();

    if (upper === "GROUP" && nextT === "BY") {
      normalizedTokens.push("GROUP BY");
      i++;
    } else if (upper === "ORDER" && nextT === "BY") {
      normalizedTokens.push("ORDER BY");
      i++;
    } else if (upper === "UNION" && nextT === "ALL") {
      normalizedTokens.push("UNION ALL");
      i++;
    } else if (upper === "CONNECT" && nextT === "BY") {
      normalizedTokens.push("CONNECT BY");
      i++;
    } else if (upper === "START" && nextT === "WITH") {
      normalizedTokens.push("START WITH");
      i++;
    } else if (upper === "INSERT" && nextT === "INTO") {
      normalizedTokens.push("INSERT INTO");
      i++;
    } else if (upper === "DELETE" && nextT === "FROM") {
      normalizedTokens.push("DELETE FROM");
      i++;
    } else if (upper === "LEFT" && nextT === "JOIN") {
      normalizedTokens.push("LEFT JOIN");
      i++;
    } else if (upper === "RIGHT" && nextT === "JOIN") {
      normalizedTokens.push("RIGHT JOIN");
      i++;
    } else if (upper === "INNER" && nextT === "JOIN") {
      normalizedTokens.push("INNER JOIN");
      i++;
    } else if (upper === "FULL" && nextT === "JOIN") {
      normalizedTokens.push("FULL JOIN");
      i++;
    } else if (upper === "CROSS" && nextT === "JOIN") {
      normalizedTokens.push("CROSS JOIN");
      i++;
    } else if (upper === "LEFT" && nextT === "OUTER" && nextNextT === "JOIN") {
      normalizedTokens.push("LEFT OUTER JOIN");
      i += 2;
    } else if (upper === "RIGHT" && nextT === "OUTER" && nextNextT === "JOIN") {
      normalizedTokens.push("RIGHT OUTER JOIN");
      i += 2;
    } else if (upper === "FULL" && nextT === "OUTER" && nextNextT === "JOIN") {
      normalizedTokens.push("FULL OUTER JOIN");
      i += 2;
    } else {
      normalizedTokens.push(t);
    }
  }

  // Pre-calculate which parentheses indices belong to multi-line subqueries vs inline function calls
  const isSubqueryParen: boolean[] = new Array(normalizedTokens.length).fill(false);
  const parenStack: number[] = [];

  for (let i = 0; i < normalizedTokens.length; i++) {
    const token = normalizedTokens[i];
    if (token === "(") {
      parenStack.push(i);
    } else if (token === ")" && parenStack.length > 0) {
      const openIndex = parenStack.pop()!;
      // Check if tokens between openIndex and i contain a subquery keyword
      let hasSubqueryKeyword = false;
      for (let j = openIndex + 1; j < i; j++) {
        if (SUBQUERY_KEYWORDS.includes(normalizedTokens[j].toUpperCase())) {
          hasSubqueryKeyword = true;
          break;
        }
      }
      if (hasSubqueryKeyword) {
        isSubqueryParen[openIndex] = true;
        isSubqueryParen[i] = true;
      }
    }
  }

  const INDENT = "    "; // 4 spaces
  let subqueryDepth = 0;
  let isUnderClause = false;
  let inBetween = false;
  const openParenTypes: ("subquery" | "inline")[] = [];
  const resultLines: string[] = [];
  let currentLine = "";

  const pushLine = (line: string, customDepthOffset = 0) => {
    if (line.trim()) {
      const depth = Math.max(0, subqueryDepth + customDepthOffset);
      resultLines.push(INDENT.repeat(depth) + line.trim());
    }
  };

  for (let i = 0; i < normalizedTokens.length; i++) {
    const token = normalizedTokens[i];
    const upper = token.toUpperCase();

    // Comments
    if (token.startsWith("--") || token.startsWith("/*")) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      pushLine(token, isUnderClause ? 1 : 0);
      continue;
    }

    // Major clause keywords (SELECT, FROM, WHERE, etc.)
    if (MAJOR_KEYWORDS.includes(upper)) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      pushLine(upper, 0);
      isUnderClause = true;
      inBetween = false;
      continue;
    }

    // Join keywords (JOIN, LEFT JOIN, INNER JOIN, etc.) — keep JOIN ... ON ... on the same line!
    if (JOIN_KEYWORDS.includes(upper)) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      currentLine = upper + " ";
      isUnderClause = false;
      inBetween = false;
      continue;
    }

    // Track BETWEEN keyword
    if (upper === "BETWEEN") {
      inBetween = true;
      if (currentLine.length > 0 && !currentLine.endsWith(" ")) {
        currentLine += " ";
      }
      currentLine += token;
      continue;
    }

    // Logical operators (AND, OR)
    if (LOGICAL_OPERATORS.includes(upper)) {
      if (upper === "AND" && inBetween) {
        // Keep AND on the same line for BETWEEN x AND y!
        inBetween = false; // reset after AND in BETWEEN
        if (currentLine.length > 0 && !currentLine.endsWith(" ")) {
          currentLine += " ";
        }
        currentLine += token;
        continue;
      }

      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      currentLine = upper + " ";
      isUnderClause = true;
      inBetween = false;
      continue;
    }

    // Opening parenthesis '('
    if (token === "(") {
      if (isSubqueryParen[i]) {
        // Multi-line subquery parenthesis
        openParenTypes.push("subquery");
        if (currentLine.trim()) {
          pushLine(currentLine, isUnderClause ? 1 : 0);
          currentLine = "";
        }
        pushLine("(", 1);
        subqueryDepth += 2;
        isUnderClause = false;
      } else {
        // Inline function parenthesis (e.g. TRUNC(...), NVL(...), COUNT(...))
        openParenTypes.push("inline");
        if (
          currentLine.length > 0 &&
          !currentLine.endsWith(" ") &&
          !/^[a-zA-Z0-9_$]+$/.test(normalizedTokens[i - 1] || "")
        ) {
          currentLine += " ";
        }
        currentLine += "(";
      }
      continue;
    }

    // Closing parenthesis ')'
    if (token === ")") {
      const parenType = openParenTypes.pop() ?? (isSubqueryParen[i] ? "subquery" : "inline");
      if (parenType === "subquery") {
        // Multi-line subquery closing parenthesis
        if (currentLine.trim()) {
          pushLine(currentLine, isUnderClause ? 1 : 0);
          currentLine = "";
        }
        subqueryDepth = Math.max(0, subqueryDepth - 2);
        pushLine(")", 1);
        isUnderClause = true;
      } else {
        // Inline function closing parenthesis
        currentLine += ")";
      }
      continue;
    }

    // Comma list separator
    if (token === ",") {
      const currentParenContext = openParenTypes[openParenTypes.length - 1];
      if (currentParenContext === "inline") {
        // Inside inline function call parameters (e.g. TRUNC(created_at, 'DD')) — keep inline!
        currentLine += ", ";
      } else {
        // Top-level clause list items — push to new line
        if (currentLine.trim()) {
          pushLine(currentLine + ",", isUnderClause ? 1 : 0);
          currentLine = "";
        }
      }
      continue;
    }

    // Normal tokens
    if (currentLine.length > 0 && !currentLine.endsWith(" ") && !currentLine.endsWith("(")) {
      currentLine += " ";
    }
    currentLine += token;
  }

  if (currentLine.trim()) {
    pushLine(currentLine, isUnderClause ? 1 : 0);
  }

  let formatted = resultLines.join("\n");
  if (hasSemicolon) {
    formatted += ";";
  }

  return formatted;
}

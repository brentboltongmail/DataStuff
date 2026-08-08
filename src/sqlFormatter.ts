/**
 * Custom SQL Formatter enforcing:
 * - 4-space indentations for clause items
 * - Major SQL keywords on new lines
 * - Subquery opening '(' on its own new line
 * - Subquery starting on even the next line below '(' indented +4 spaces further
 * - Closing ')' on its own line aligned with opening parenthesis
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
  "ON",
];

const LOGICAL_OPERATORS = ["AND", "OR"];

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

  const INDENT = "    "; // 4 spaces
  let subqueryDepth = 0;
  let isUnderClause = false;
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
      pushLine(upper, 0); // Keyword at base subquery depth
      isUnderClause = true; // Following items indented +1
      continue;
    }

    // Join keywords (JOIN, LEFT JOIN, ON, etc.)
    if (JOIN_KEYWORDS.includes(upper)) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      pushLine(upper, 0);
      isUnderClause = true;
      continue;
    }

    // Logical operators (AND, OR)
    if (LOGICAL_OPERATORS.includes(upper)) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      currentLine = upper + " ";
      isUnderClause = true;
      continue;
    }

    // Opening parenthesis '(' for subqueries / expressions
    if (token === "(") {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      // Parenthesis on next line at clause level (+1 depth)
      pushLine("(", 1);
      // Inner subquery starts on even the next line below, indented +4 spaces further (+2 depth)
      subqueryDepth += 2;
      isUnderClause = false;
      continue;
    }

    // Closing parenthesis ')'
    if (token === ")") {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      subqueryDepth = Math.max(0, subqueryDepth - 2);
      // Closing parenthesis aligned with opening parenthesis (+1 depth)
      pushLine(")", 1);
      isUnderClause = true;
      continue;
    }

    // Comma list separator
    if (token === ",") {
      if (currentLine.trim()) {
        pushLine(currentLine + ",", isUnderClause ? 1 : 0);
        currentLine = "";
      }
      continue;
    }

    // Normal tokens (column names, values, table names)
    if (currentLine.length > 0 && !currentLine.endsWith(" ")) {
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

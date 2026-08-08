/**
 * Custom SQL Formatter enforcing:
 * - Separate queries separated by 2 blank lines
 * - Single item clauses (SELECT, FROM, WHERE, ORDER BY, GROUP BY) formatted on the SAME line as the keyword
 * - Multiple item clauses formatted with 4-space indentations on separate lines
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

  // Split input into individual queries by semicolons or blank line breaks (\n\s*\n+)
  // respecting string literals ('...') and comments (-- / /* ... */)
  const queryChunks: { text: string; hasSemicolon: boolean }[] = [];
  let currentChunk = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || "";

    if (inLineComment) {
      currentChunk += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      currentChunk += char;
      if (char === "*" && nextChar === "/") {
        currentChunk += "/";
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inString) {
      if (char === "-" && nextChar === "-") {
        currentChunk += "--";
        i++;
        inLineComment = true;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        currentChunk += "/*";
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (char === "'" || char === '"') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      currentChunk += char;
      continue;
    }

    if (inString) {
      currentChunk += char;
      continue;
    }

    // Semicolon query terminator
    if (char === ";") {
      if (currentChunk.trim()) {
        queryChunks.push({ text: currentChunk.trim(), hasSemicolon: true });
        currentChunk = "";
      }
      continue;
    }

    // Blank line separator (\n followed by optional whitespace and \n)
    if (char === "\n") {
      let isBlankLine = false;
      let j = i + 1;
      while (j < sql.length && (sql[j] === " " || sql[j] === "\t" || sql[j] === "\r")) {
        j++;
      }
      if (j < sql.length && sql[j] === "\n") {
        isBlankLine = true;
      }

      if (isBlankLine && currentChunk.trim()) {
        queryChunks.push({ text: currentChunk.trim(), hasSemicolon: false });
        currentChunk = "";
        i = j;
        continue;
      }
    }

    currentChunk += char;
  }

  if (currentChunk.trim()) {
    queryChunks.push({ text: currentChunk.trim(), hasSemicolon: false });
  }

  if (queryChunks.length === 0) return sql;

  const formattedQueries = queryChunks.map((chunk) => {
    const formatted = formatSingleQuery(chunk.text);
    return chunk.hasSemicolon && !formatted.endsWith(";") ? formatted + ";" : formatted;
  });

  // Keep separate queries separated by 2 blank lines (\n\n\n)
  return formattedQueries.join("\n\n\n");
}

function formatSingleQuery(cleanSql: string): string {
  const hasSemicolon = cleanSql.endsWith(";");
  const sqlToFormat = hasSemicolon ? cleanSql.slice(0, -1).trim() : cleanSql;

  const tokens: string[] = [];
  let currentToken = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlToFormat.length; i++) {
    const char = sqlToFormat[i];
    const nextChar = sqlToFormat[i + 1] || "";

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

    if (char === "(" || char === ")" || char === ",") {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
      }
      tokens.push(char);
      currentToken = "";
      continue;
    }

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

  const isSubqueryParen: boolean[] = new Array(normalizedTokens.length).fill(false);
  const parenStack: number[] = [];

  for (let i = 0; i < normalizedTokens.length; i++) {
    const token = normalizedTokens[i];
    if (token === "(") {
      parenStack.push(i);
    } else if (token === ")" && parenStack.length > 0) {
      const openIndex = parenStack.pop()!;
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

  const isSingleItemClause: boolean[] = new Array(normalizedTokens.length).fill(false);
  for (let i = 0; i < normalizedTokens.length; i++) {
    const upper = normalizedTokens[i].toUpperCase();
    if (MAJOR_KEYWORDS.includes(upper)) {
      let commaCount = 0;
      let logicalOpCount = 0;
      let joinCount = 0;
      let parenDepth = 0;
      let scanInBetween = false;

      for (let j = i + 1; j < normalizedTokens.length; j++) {
        const tok = normalizedTokens[j];
        const tokUpper = tok.toUpperCase();

        if (tok === "(") parenDepth++;
        if (tok === ")") {
          if (parenDepth === 0) break;
          parenDepth--;
        }

        if (parenDepth === 0) {
          if (MAJOR_KEYWORDS.includes(tokUpper)) break;
          if (JOIN_KEYWORDS.includes(tokUpper)) joinCount++;
          if (tok === ",") commaCount++;
          if (tokUpper === "BETWEEN") scanInBetween = true;
          if (tokUpper === "AND" || tokUpper === "OR") {
            if (tokUpper === "AND" && scanInBetween) {
              scanInBetween = false;
            } else {
              logicalOpCount++;
            }
          }
        }
      }

      if (upper === "SELECT" || upper === "GROUP BY" || upper === "ORDER BY" || upper === "SET" || upper === "VALUES") {
        if (commaCount === 0) isSingleItemClause[i] = true;
      } else if (upper === "WHERE" || upper === "HAVING") {
        if (logicalOpCount === 0) isSingleItemClause[i] = true;
      } else if (upper === "FROM") {
        if (commaCount === 0 && joinCount === 0) isSingleItemClause[i] = true;
      } else {
        if (commaCount === 0) isSingleItemClause[i] = true;
      }
    }
  }

  const INDENT = "    ";
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

    if (token.startsWith("--") || token.startsWith("/*")) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      pushLine(token, isUnderClause ? 1 : 0);
      continue;
    }

    if (MAJOR_KEYWORDS.includes(upper)) {
      if (currentLine.trim()) {
        pushLine(currentLine, isUnderClause ? 1 : 0);
        currentLine = "";
      }
      if (isSingleItemClause[i]) {
        currentLine = upper + " ";
        isUnderClause = false;
      } else {
        pushLine(upper, 0);
        isUnderClause = true;
      }
      inBetween = false;
      continue;
    }

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

    if (upper === "BETWEEN") {
      inBetween = true;
      if (currentLine.length > 0 && !currentLine.endsWith(" ")) {
        currentLine += " ";
      }
      currentLine += token;
      continue;
    }

    if (LOGICAL_OPERATORS.includes(upper)) {
      if (upper === "AND" && inBetween) {
        inBetween = false;
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

    if (token === "(") {
      if (isSubqueryParen[i]) {
        openParenTypes.push("subquery");
        if (currentLine.trim()) {
          pushLine(currentLine, isUnderClause ? 1 : 0);
          currentLine = "";
        }
        pushLine("(", 1);
        subqueryDepth += 2;
        isUnderClause = false;
      } else {
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

    if (token === ")") {
      const parenType = openParenTypes.pop() ?? (isSubqueryParen[i] ? "subquery" : "inline");
      if (parenType === "subquery") {
        if (currentLine.trim()) {
          pushLine(currentLine, isUnderClause ? 1 : 0);
          currentLine = "";
        }
        subqueryDepth = Math.max(0, subqueryDepth - 2);
        pushLine(")", 1);
        isUnderClause = true;
      } else {
        currentLine += ")";
      }
      continue;
    }

    if (token === ",") {
      const currentParenContext = openParenTypes[openParenTypes.length - 1];
      if (currentParenContext === "inline") {
        currentLine += ", ";
      } else {
        if (currentLine.trim()) {
          pushLine(currentLine + ",", isUnderClause ? 1 : 0);
          currentLine = "";
        }
      }
      continue;
    }

    if (currentLine.length > 0 && !currentLine.endsWith(" ") && !currentLine.endsWith("(")) {
      currentLine += " ";
    }
    currentLine += token;
  }

  if (currentLine.trim()) {
    pushLine(currentLine, isUnderClause ? 1 : 0);
  }

  return resultLines.join("\n");
}

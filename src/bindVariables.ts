export type BindType = "VARCHAR2" | "NUMBER" | "DATE" | "TIMESTAMP" | "NULL";

export interface BindVarParam {
  name: string;
  type: BindType;
  value: string;
}

/**
 * Extracts unique bind variable names (e.g. ":location", ":dept_id") from SQL text.
 * Ignores single-line (-- ...) and multi-line (/* ... *\/) comments, string literals ('...'),
 * and double colons :: or PL/SQL assignment :=.
 */
export function parseBindVariables(sql: string): string[] {
  if (!sql) return [];

  // Remove comments and string literals to prevent matching inside quotes or comments
  const cleanSql = sql
    .replace(/--.*$/gm, "") // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Multi-line comments
    .replace(/'(?:''|[^'])*'/g, ""); // String literals

  // Regex for Oracle bind variables:
  // Must start with colon (:), followed by alphanumeric/underscore/dollar,
  // NOT preceded by colon (to exclude ::) and NOT followed by = (to exclude :=).
  const bindRegex = /(?<!:):([a-zA-Z0-9_$]+)(?!=)/g;

  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = bindRegex.exec(cleanSql)) !== null) {
    const varName = match[1];
    // Exclude purely numeric positional binds if any, keeping named binds
    if (varName && !/^\d+$/.test(varName)) {
      names.add(varName);
    }
  }

  return Array.from(names);
}

/**
 * Converts typed bind parameter into the appropriate JavaScript runtime value for Oracle JDBC bridge.
 */
export function coerceBindValue(param: BindVarParam): unknown {
  if (param.type === "NULL" || param.value === "" || param.value === null) {
    return null;
  }
  switch (param.type) {
    case "NUMBER": {
      const num = Number(param.value);
      return isNaN(num) ? param.value : num;
    }
    case "DATE":
    case "TIMESTAMP":
    case "VARCHAR2":
    default:
      return String(param.value);
  }
}

/**
 * Converts Oracle SQL with named bind variables (e.g. :location) into JDBC positional SQL (?, ?)
 * and converts string bind values into their typed JS/Java objects for Oracle execution.
 */
export function prepareSqlWithBinds(
  sql: string,
  bindsMap: Record<string, BindVarParam>,
): { preparedSql: string; positionalBinds: unknown[] } {
  if (!sql) return { preparedSql: sql, positionalBinds: [] };

  const positionalBinds: unknown[] = [];

  // Replace each named bind variable in original SQL (outside quotes/comments)
  const cleanSqlForPositional = sql.replace(
    /'(?:''|[^'])*'|--.*$|\/\*[\s\S]*?\*\/|(?<!:):([a-zA-Z0-9_$]+)(?!=)/gm,
    (match, group1) => {
      // If group1 matched, it's a bind variable!
      if (group1) {
        const param = bindsMap[group1] ?? { name: group1, type: "VARCHAR2", value: "" };
        positionalBinds.push(coerceBindValue(param));
        return "?";
      }
      return match;
    },
  );

  return {
    preparedSql: cleanSqlForPositional,
    positionalBinds,
  };
}

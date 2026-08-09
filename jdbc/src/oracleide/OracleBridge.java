package oracleide;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * Line-delimited JSON bridge for Oracle JDBC.
 * One JSON request per stdin line; one JSON response per stdout line.
 */
public final class OracleBridge {
  private static final int DEFAULT_MAX_ROWS = 1000;
  private static final int HARD_MAX_ROWS = 100_000;
  private static Connection connection;

  public static void main(String[] args) throws Exception {
    Class.forName("oracle.jdbc.OracleDriver");
    BufferedReader reader =
        new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      line = line.trim();
      if (line.isEmpty()) {
        continue;
      }
      Map<String, Object> request;
      try {
        request = Json.parseObject(line);
      } catch (RuntimeException ex) {
        write(response(null, false, null, "Invalid JSON: " + ex.getMessage()));
        continue;
      }
      Object id = request.get("id");
      String cmd = stringVal(request.get("cmd"));
      try {
        write(handle(id, cmd, request));
      } catch (Exception ex) {
        int offset = getErrorOffset(ex);
        String msg = ex.getMessage() == null ? ex.toString() : ex.getMessage();
        String sql = stringVal(request.get("sql"));
        if (offset >= 0 && sql != null && !sql.isEmpty()) {
          int errLine = 1;
          int errCol = 1;
          int len = Math.min(offset, sql.length());
          for (int i = 0; i < len; i++) {
            if (sql.charAt(i) == '\n') {
              errLine++;
              errCol = 1;
            } else {
              errCol++;
            }
          }
          if (!msg.contains("at line ")) {
            msg = msg + " at line " + errLine + ", column " + errCol;
          }
        }
        write(response(id, false, null, msg));
      }
    }
  }

  private static int getErrorOffset(Throwable t) {
    if (t == null) return -1;
    try {
      java.lang.reflect.Method m = t.getClass().getMethod("getOffset");
      Object val = m.invoke(t);
      if (val instanceof Integer intVal && intVal >= 0) {
        return intVal;
      }
    } catch (Throwable ignored) {}
    if (t.getCause() != null && t.getCause() != t) {
      return getErrorOffset(t.getCause());
    }
    return -1;
  }

  private static Map<String, Object> handle(Object id, String cmd, Map<String, Object> request)
      throws Exception {
    switch (cmd == null ? "" : cmd) {
      case "ping":
        return response(id, true, mapOf("ready", true), null);
      case "connect":
        return connect(id, request);
      case "disconnect":
        return disconnect(id);
      case "cancel":
        return response(id, true, cancelQuery(), null);
      case "execute":
        return execute(
            id,
            stringVal(request.get("sql")),
            intVal(request.get("maxRows"), 1000),
            asList(request.get("binds")));
      case "commit":
        requireConnection().commit();
        return response(id, true, mapOf("committed", true), null);
      case "rollback":
        requireConnection().rollback();
        return response(id, true, mapOf("rolledBack", true), null);
      case "listObjects":
        return listObjects(id);
      case "listColumns":
        return listColumns(id, stringVal(request.get("name")));
      case "listPrimaryKeys":
        return listPrimaryKeys(id, stringVal(request.get("name")));
      case "explain":
        return explain(id, stringVal(request.get("sql")), asList(request.get("binds")));
      case "status":
        return status(id);
      default:
        return response(id, false, null, "Unknown command: " + cmd);
    }
  }

  private static Map<String, Object> connect(Object id, Map<String, Object> request)
      throws Exception {
    disconnectQuietly();
    String user = stringVal(request.get("user"));
    String password = stringVal(request.get("password"));
    boolean tcps = boolVal(request.get("tcps"), false);
    String url = stringVal(request.get("url"));
    if (url == null || url.isEmpty()) {
      String host = stringVal(request.get("host"));
      String port = stringVal(request.get("port"));
      if (port == null || port.isEmpty()) {
        port = tcps ? "2484" : "1521";
      }
      String service = stringVal(request.get("service"));
      if (tcps) {
        url = "jdbc:oracle:thin:@tcps://" + host + ":" + port + "/" + service;
      } else {
        url = "jdbc:oracle:thin:@//" + host + ":" + port + "/" + service;
      }
    }
    Properties props = new Properties();
    props.setProperty("user", user);
    props.setProperty("password", password == null ? "" : password);
    props.setProperty("oracle.net.CONNECT_TIMEOUT", "5000");
    if (tcps) {
      // Prefer verifying the server certificate DN when the listener presents a proper cert.
      props.setProperty("oracle.net.ssl_server_dn_match", "true");
    }
    connection = DriverManager.getConnection(url, props);
    connection.setAutoCommit(false);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("connected", true);
    result.put("user", user);
    result.put(
        "connectString",
        url.replace("jdbc:oracle:thin:@tcps://", "tcps://")
            .replace("jdbc:oracle:thin:@//", ""));
    result.put("mode", "jdbc");
    result.put("tcps", tcps);
    return response(id, true, result, null);
  }

  private static Map<String, Object> disconnect(Object id) throws SQLException {
    disconnectQuietly();
    return response(id, true, mapOf("connected", false, "mode", "jdbc"), null);
  }

  private static Map<String, Object> status(Object id) throws SQLException {
    Map<String, Object> result = new LinkedHashMap<>();
    boolean connected = false;
    if (connection != null && !connection.isClosed()) {
      try {
        // Actually probe the DB (not just local closed flag).
        connected = connection.isValid(5);
      } catch (SQLException ignored) {
        connected = false;
      }
      if (!connected) {
        disconnectQuietly();
      }
    }
    result.put("connected", connected);
    result.put("mode", "jdbc");
    if (connected) {
      DatabaseMetaData meta = connection.getMetaData();
      result.put("user", meta.getUserName());
      result.put("connectString", meta.getURL().replace("jdbc:oracle:thin:@//", ""));
    }
    return response(id, true, result, null);
  }

  private static volatile Statement activeStatement = null;

  private static synchronized void setActiveStatement(Statement stmt) {
    activeStatement = stmt;
  }

  private static synchronized void clearActiveStatement() {
    activeStatement = null;
  }

  private static Map<String, Object> cancelQuery() {
    Map<String, Object> result = new LinkedHashMap<>();
    Statement stmt = activeStatement;
    if (stmt != null) {
      try {
        if (!stmt.isClosed()) {
          stmt.cancel();
          result.put("cancelled", true);
          result.put("message", "Query execution cancelled by user");
          return result;
        }
      } catch (Exception e) {
        result.put("cancelled", false);
        result.put("message", "Cancel failed: " + e.getMessage());
        return result;
      }
    }
    result.put("cancelled", true);
    result.put("message", "No active query statement to cancel");
    return result;
  }

  private static Map<String, Object> execute(
      Object id, String sql, int maxRows, List<Object> binds) throws Exception {
    Connection conn = requireConnection();
    if (sql == null) {
      throw new IllegalArgumentException("SQL is empty");
    }
    String cleaned = sql.replaceAll(";+\\s*$", "").trim();
    if (cleaned.isEmpty()) {
      throw new IllegalArgumentException("SQL is empty");
    }
    int limit = Math.max(1, Math.min(maxRows, HARD_MAX_ROWS));
    List<Object> bindList = binds == null ? List.of() : binds;

    long started = System.currentTimeMillis();
    boolean selectLike = isSelectLike(cleaned);

    if (!bindList.isEmpty()) {
      try (var ps = conn.prepareStatement(cleaned)) {
        setActiveStatement(ps);
        for (int i = 0; i < bindList.size(); i++) {
          Object value = bindList.get(i);
          if (value == null) {
            ps.setNull(i + 1, Types.NULL);
          } else {
            ps.setObject(i + 1, value);
          }
        }
        if (selectLike) {
          ps.setMaxRows(limit + 1);
        }
        boolean hasResultSet = ps.execute();
        long elapsedMs = System.currentTimeMillis() - started;
        return response(id, true, buildExecuteResult(ps, hasResultSet, selectLike, limit, elapsedMs), null);
      } finally {
        clearActiveStatement();
      }
    }

    try (Statement statement = conn.createStatement()) {
      setActiveStatement(statement);
      statement.setMaxRows(selectLike ? limit + 1 : 0);
      boolean hasResultSet = statement.execute(cleaned);
      long elapsedMs = System.currentTimeMillis() - started;
      return response(
          id, true, buildExecuteResult(statement, hasResultSet, selectLike, limit, elapsedMs), null);
    } finally {
      clearActiveStatement();
    }
  }

  /**
   * Runs EXPLAIN PLAN for the given SQL and returns the plan as a result grid.
   * Uses a savepoint so explain rows are rolled back and do not dirty the user transaction.
   */
  private static Map<String, Object> explain(Object id, String sql, List<Object> binds) throws Exception {
    Connection conn = requireConnection();
    if (sql == null) {
      throw new IllegalArgumentException("SQL is empty");
    }
    String cleaned = sql.replaceAll(";+\\s*$", "").trim();
    if (cleaned.isEmpty()) {
      throw new IllegalArgumentException("SQL is empty");
    }
    // Strip leading EXPLAIN PLAN if the user already typed it.
    cleaned = cleaned.replaceFirst("(?is)^\\s*EXPLAIN\\s+PLAN\\s+(SET\\s+STATEMENT_ID\\s*=\\s*'[^']*'\\s+)?FOR\\s+", "");

    String statementId = "DS" + Long.toHexString(System.nanoTime());
    long started = System.currentTimeMillis();
    List<Object> bindList = binds == null ? List.of() : binds;

    try (Statement statement = conn.createStatement()) {
      statement.execute("SAVEPOINT ds_explain_sp");
      try {
        if (!bindList.isEmpty()) {
          try (PreparedStatement ps = conn.prepareStatement(
              "EXPLAIN PLAN SET STATEMENT_ID = '" + statementId + "' FOR " + cleaned)) {
            for (int i = 0; i < bindList.size(); i++) {
              Object value = bindList.get(i);
              if (value == null) {
                ps.setNull(i + 1, Types.NULL);
              } else {
                ps.setObject(i + 1, value);
              }
            }
            ps.execute();
          }
        } else {
          statement.execute(
              "EXPLAIN PLAN SET STATEMENT_ID = '" + statementId + "' FOR " + cleaned);
        }

        String planSql =
            "SELECT"
                + " LPAD(' ', 2 * (LEVEL - 1)) || OPERATION AS OPERATION,"
                + " OPTIONS,"
                + " OBJECT_OWNER,"
                + " OBJECT_NAME,"
                + " OBJECT_TYPE,"
                + " ID,"
                + " PARENT_ID,"
                + " COST,"
                + " CARDINALITY,"
                + " BYTES,"
                + " ACCESS_PREDICATES,"
                + " FILTER_PREDICATES"
                + " FROM PLAN_TABLE"
                + " WHERE STATEMENT_ID = ?"
                + " START WITH ID = 0 AND STATEMENT_ID = ?"
                + " CONNECT BY PRIOR ID = PARENT_ID AND PRIOR STATEMENT_ID = STATEMENT_ID"
                + " ORDER SIBLINGS BY POSITION";

        List<Map<String, Object>> columns = new ArrayList<>();
        String[] names = {
          "OPERATION",
          "OPTIONS",
          "OBJECT_OWNER",
          "OBJECT_NAME",
          "OBJECT_TYPE",
          "ID",
          "PARENT_ID",
          "COST",
          "CARDINALITY",
          "BYTES",
          "ACCESS_PREDICATES",
          "FILTER_PREDICATES"
        };
        for (String name : names) {
          Map<String, Object> col = new LinkedHashMap<>();
          col.put("name", name);
          col.put("type", "VARCHAR2");
          columns.add(col);
        }

        List<List<Object>> rows = new ArrayList<>();
        List<String> indexes = new ArrayList<>();
        try (var ps = conn.prepareStatement(planSql)) {
          ps.setString(1, statementId);
          ps.setString(2, statementId);
          try (ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
              List<Object> row = new ArrayList<>(names.length);
              for (int i = 1; i <= names.length; i++) {
                row.add(rs.getObject(i));
              }
              rows.add(row);

              String operation = stringVal(rs.getObject("OPERATION"));
              String objectType = stringVal(rs.getObject("OBJECT_TYPE"));
              String objectName = stringVal(rs.getObject("OBJECT_NAME"));
              String objectOwner = stringVal(rs.getObject("OBJECT_OWNER"));
              if (objectName != null
                  && (containsIgnoreCase(operation, "INDEX")
                      || containsIgnoreCase(objectType, "INDEX"))) {
                String qualified =
                    objectOwner != null && !objectOwner.isEmpty()
                        ? objectOwner + "." + objectName
                        : objectName;
                if (!indexes.contains(qualified)) {
                  indexes.add(qualified);
                }
              }
            }
          }
        }

        Map<String, String> indexDefinitions = new LinkedHashMap<>();
        for (String qualified : indexes) {
          try {
            String definition = fetchIndexDefinition(qualified);
            if (definition != null && !definition.isEmpty()) {
              indexDefinitions.put(qualified, definition);
              indexDefinitions.put(qualified.toUpperCase(), definition);
              int dot = qualified.lastIndexOf('.');
              if (dot > 0) {
                String bare = qualified.substring(dot + 1);
                indexDefinitions.putIfAbsent(bare, definition);
                indexDefinitions.putIfAbsent(bare.toUpperCase(), definition);
              }
            }
          } catch (SQLException ignored) {
            // leave without tooltip text for this index
          }
        }

        long elapsedMs = System.currentTimeMillis() - started;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", columns);
        result.put("rows", rows);
        result.put("rowsAffected", 0);
        result.put("isSelect", true);
        result.put("truncated", false);
        result.put("elapsedMs", elapsedMs);
        result.put("indexes", indexes);
        result.put("indexDefinitions", indexDefinitions);
        result.put("statementId", statementId);
        return response(id, true, result, null);
      } finally {
        try {
          statement.execute("ROLLBACK TO SAVEPOINT ds_explain_sp");
        } catch (SQLException ignored) {
          // ignore — connection may already be invalid
        }
      }
    }
  }

  private static boolean containsIgnoreCase(String value, String needle) {
    return value != null && value.toUpperCase().contains(needle.toUpperCase());
  }

  /** Resolve OWNER.INDEX_NAME (or bare INDEX_NAME) into a human-readable definition. */
  private static String fetchIndexDefinition(String qualifiedName) throws SQLException {
    if (qualifiedName == null || qualifiedName.isEmpty()) {
      return null;
    }
    String owner = null;
    String indexName = qualifiedName.trim();
    int dot = indexName.lastIndexOf('.');
    if (dot > 0) {
      owner = indexName.substring(0, dot).replace("\"", "");
      indexName = indexName.substring(dot + 1).replace("\"", "");
    } else {
      indexName = indexName.replace("\"", "");
    }

    String sql =
        "SELECT i.owner, i.index_name, i.table_owner, i.table_name, i.uniqueness, i.index_type,"
            + " LISTAGG(c.column_name || CASE WHEN c.descend = 'DESC' THEN ' DESC' ELSE '' END, ', ')"
            + " WITHIN GROUP (ORDER BY c.column_position) AS column_list"
            + " FROM all_indexes i"
            + " JOIN all_ind_columns c"
            + "   ON c.index_owner = i.owner AND c.index_name = i.index_name"
            + " WHERE UPPER(i.index_name) = UPPER(?)"
            + (owner != null ? " AND UPPER(i.owner) = UPPER(?)" : "")
            + " GROUP BY i.owner, i.index_name, i.table_owner, i.table_name, i.uniqueness, i.index_type";

    try (var ps = requireConnection().prepareStatement(sql)) {
      ps.setString(1, indexName);
      if (owner != null) {
        ps.setString(2, owner);
      }
      try (ResultSet rs = ps.executeQuery()) {
        if (!rs.next()) {
          return null;
        }
        String idxOwner = rs.getString("owner");
        String idxName = rs.getString("index_name");
        String tableOwner = rs.getString("table_owner");
        String tableName = rs.getString("table_name");
        String uniqueness = rs.getString("uniqueness");
        String indexType = rs.getString("index_type");
        String columns = rs.getString("column_list");
        boolean unique = uniqueness != null && uniqueness.equalsIgnoreCase("UNIQUE");
        StringBuilder sb = new StringBuilder();
        sb.append(unique ? "UNIQUE " : "");
        if (indexType != null && !indexType.isEmpty()) {
          sb.append(indexType).append(' ');
        }
        sb.append("INDEX ").append(idxOwner).append('.').append(idxName);
        sb.append('\n').append("ON ").append(tableOwner).append('.').append(tableName);
        if (columns != null && !columns.isEmpty()) {
          sb.append(" (").append(columns).append(')');
        }
        return sb.toString();
      }
    }
  }

  private static Map<String, Object> buildExecuteResult(
      Statement statement, boolean hasResultSet, boolean selectLike, int limit, long elapsedMs)
      throws SQLException {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("elapsedMs", elapsedMs);

    if (hasResultSet) {
      try (ResultSet rs = statement.getResultSet()) {
        ResultSetMetaData meta = rs.getMetaData();
        int columnCount = meta.getColumnCount();
        List<Map<String, Object>> columns = new ArrayList<>();
        for (int i = 1; i <= columnCount; i++) {
          Map<String, Object> col = new LinkedHashMap<>();
          col.put("name", meta.getColumnLabel(i));
          col.put("type", meta.getColumnTypeName(i));
          columns.add(col);
        }

        List<List<Object>> rows = new ArrayList<>();
        int count = 0;
        boolean truncated = false;
        while (rs.next()) {
          if (count >= limit) {
            truncated = true;
            break;
          }
          List<Object> row = new ArrayList<>(columnCount);
          for (int i = 1; i <= columnCount; i++) {
            row.add(readValue(rs, i, meta.getColumnType(i)));
          }
          rows.add(row);
          count++;
        }

        result.put("columns", columns);
        result.put("rows", rows);
        result.put("rowsAffected", 0);
        result.put("isSelect", true);
        result.put("truncated", truncated);
      }
    } else {
      result.put("columns", new ArrayList<>());
      result.put("rows", new ArrayList<>());
      result.put("rowsAffected", statement.getUpdateCount() < 0 ? 0 : statement.getUpdateCount());
      result.put("isSelect", false);
      result.put("truncated", false);
    }
    return result;
  }

  private static Map<String, Object> listPrimaryKeys(Object id, String name) throws Exception {
    if (name == null || name.isEmpty()) {
      throw new IllegalArgumentException("Object name is required");
    }
    String objectName = name.toUpperCase().replace("\"", "");
    if (objectName.contains(".")) {
      objectName = objectName.substring(objectName.lastIndexOf('.') + 1);
    }
    String sql =
        "SELECT cols.column_name "
            + "FROM user_constraints cons "
            + "JOIN user_cons_columns cols "
            + "  ON cons.constraint_name = cols.constraint_name "
            + " AND cons.owner = cols.owner "
            + "WHERE cons.constraint_type = 'P' "
            + "  AND cons.table_name = ? "
            + "ORDER BY cols.position";
    try (var ps = requireConnection().prepareStatement(sql)) {
      ps.setString(1, objectName);
      try (ResultSet rs = ps.executeQuery()) {
        List<String> keys = new ArrayList<>();
        while (rs.next()) {
          keys.add(rs.getString(1));
        }
        return response(id, true, keys, null);
      }
    }
  }

  private static Map<String, Object> listObjects(Object id) throws Exception {
    String sql =
        "SELECT object_name, object_type FROM user_objects "
            + "WHERE object_type IN ('TABLE', 'VIEW', 'SYNONYM') "
            + "ORDER BY object_type, object_name";
    try (Statement statement = requireConnection().createStatement();
        ResultSet rs = statement.executeQuery(sql)) {
      List<Map<String, Object>> objects = new ArrayList<>();
      while (rs.next()) {
        Map<String, Object> obj = new LinkedHashMap<>();
        obj.put("name", rs.getString(1));
        obj.put("type", rs.getString(2));
        objects.add(obj);
      }
      return response(id, true, objects, null);
    }
  }

  private static Map<String, Object> listColumns(Object id, String name) throws Exception {
    if (name == null || name.isEmpty()) {
      throw new IllegalArgumentException("Object name is required");
    }
    String objectName = name.toUpperCase();
    List<Map<String, Object>> columns = fetchColumnsForTable(objectName);
    if (columns.isEmpty()) {
      // Synonyms (and some views) may not appear in USER_TAB_COLUMNS directly.
      columns = fetchColumnsViaSynonym(objectName);
    }
    return response(id, true, columns, null);
  }

  private static List<Map<String, Object>> fetchColumnsForTable(String tableName)
      throws Exception {
    String sql =
        "SELECT column_name, data_type, nullable FROM user_tab_columns "
            + "WHERE table_name = ? ORDER BY column_id";
    try (var ps = requireConnection().prepareStatement(sql)) {
      ps.setString(1, tableName);
      try (ResultSet rs = ps.executeQuery()) {
        return readColumnRows(rs);
      }
    }
  }

  private static List<Map<String, Object>> fetchColumnsViaSynonym(String synonymName)
      throws Exception {
    String sql =
        "SELECT c.column_name, c.data_type, c.nullable "
            + "FROM user_synonyms s "
            + "JOIN all_tab_columns c "
            + "  ON c.owner = NVL(s.table_owner, USER) "
            + " AND c.table_name = s.table_name "
            + "WHERE s.synonym_name = ? "
            + "ORDER BY c.column_id";
    try (var ps = requireConnection().prepareStatement(sql)) {
      ps.setString(1, synonymName);
      try (ResultSet rs = ps.executeQuery()) {
        return readColumnRows(rs);
      }
    }
  }

  private static List<Map<String, Object>> readColumnRows(ResultSet rs) throws SQLException {
    List<Map<String, Object>> columns = new ArrayList<>();
    while (rs.next()) {
      Map<String, Object> col = new LinkedHashMap<>();
      col.put("name", rs.getString(1));
      col.put("dataType", rs.getString(2));
      col.put("nullable", "Y".equalsIgnoreCase(rs.getString(3)));
      columns.add(col);
    }
    return columns;
  }

  private static Object readValue(ResultSet rs, int index, int type) throws SQLException {
    Object value = rs.getObject(index);
    if (value == null || rs.wasNull()) {
      return null;
    }
    if (value instanceof Timestamp) {
      return ((Timestamp) value).toInstant().toString();
    }
    if (value instanceof java.sql.Date) {
      return value.toString();
    }
    if (value instanceof BigDecimal) {
      return ((BigDecimal) value).toPlainString();
    }
    if (type == Types.BLOB || type == Types.CLOB || type == Types.NCLOB) {
      return String.valueOf(value);
    }
    if (value instanceof byte[]) {
      return bytesToHex((byte[]) value);
    }
    return value;
  }

  private static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format("%02X", b));
    }
    return sb.toString();
  }

  private static boolean isSelectLike(String sql) {
    String normalized = sql.replaceFirst("(?s)^\\s*/\\*.*?\\*/\\s*", "").trim();
    return normalized.matches("(?i)^(select|with|show|describe|desc)\\b.*");
  }

  private static Connection requireConnection() throws SQLException {
    if (connection == null || connection.isClosed()) {
      throw new IllegalStateException("Not connected to Oracle");
    }
    return connection;
  }

  private static void disconnectQuietly() {
    if (connection != null) {
      try {
        connection.close();
      } catch (SQLException ignored) {
        // ignore
      } finally {
        connection = null;
      }
    }
  }

  private static Map<String, Object> response(
      Object id, boolean ok, Object result, String error) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", id);
    map.put("ok", ok);
    if (ok) {
      map.put("result", result);
    } else {
      map.put("error", error == null ? "Unknown error" : error);
    }
    return map;
  }

  private static Map<String, Object> mapOf(Object... kv) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i + 1 < kv.length; i += 2) {
      map.put(String.valueOf(kv[i]), kv[i + 1]);
    }
    return map;
  }

  private static String stringVal(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static boolean boolVal(Object value, boolean fallback) {
    if (value == null) {
      return fallback;
    }
    if (value instanceof Boolean) {
      return (Boolean) value;
    }
    String text = String.valueOf(value).trim().toLowerCase();
    if (text.equals("true") || text.equals("1") || text.equals("yes")) {
      return true;
    }
    if (text.equals("false") || text.equals("0") || text.equals("no")) {
      return false;
    }
    return fallback;
  }

  @SuppressWarnings("unchecked")
  private static List<Object> asList(Object value) {
    if (value == null) {
      return List.of();
    }
    if (value instanceof List) {
      return (List<Object>) value;
    }
    return List.of(value);
  }

  private static int intVal(Object value, int fallback) {
    if (value == null) {
      return fallback;
    }
    if (value instanceof Number) {
      return ((Number) value).intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(value).trim());
    } catch (NumberFormatException ex) {
      return fallback;
    }
  }

  private static void write(Map<String, Object> payload) {
    System.out.println(Json.stringify(payload));
    System.out.flush();
  }

  /** Tiny JSON helper — enough for this bridge, no third-party deps. */
  static final class Json {
    private Json() {}

    static Map<String, Object> parseObject(String text) {
      Parser parser = new Parser(text);
      Object value = parser.parseValue();
      parser.skipWs();
      if (!parser.done()) {
        throw new IllegalArgumentException("Unexpected trailing input");
      }
      if (!(value instanceof Map)) {
        throw new IllegalArgumentException("Expected JSON object");
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) value;
      return map;
    }

    static String stringify(Object value) {
      StringBuilder sb = new StringBuilder();
      writeValue(sb, value);
      return sb.toString();
    }

    private static void writeValue(StringBuilder sb, Object value) {
      if (value == null) {
        sb.append("null");
      } else if (value instanceof String) {
        writeString(sb, (String) value);
      } else if (value instanceof Number || value instanceof Boolean) {
        sb.append(value);
      } else if (value instanceof Map) {
        sb.append('{');
        boolean first = true;
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) value;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
          if (!first) {
            sb.append(',');
          }
          first = false;
          writeString(sb, entry.getKey());
          sb.append(':');
          writeValue(sb, entry.getValue());
        }
        sb.append('}');
      } else if (value instanceof List) {
        sb.append('[');
        boolean first = true;
        for (Object item : (List<?>) value) {
          if (!first) {
            sb.append(',');
          }
          first = false;
          writeValue(sb, item);
        }
        sb.append(']');
      } else {
        writeString(sb, String.valueOf(value));
      }
    }

    private static void writeString(StringBuilder sb, String value) {
      sb.append('"');
      for (int i = 0; i < value.length(); i++) {
        char c = value.charAt(i);
        switch (c) {
          case '"':
            sb.append("\\\"");
            break;
          case '\\':
            sb.append("\\\\");
            break;
          case '\b':
            sb.append("\\b");
            break;
          case '\f':
            sb.append("\\f");
            break;
          case '\n':
            sb.append("\\n");
            break;
          case '\r':
            sb.append("\\r");
            break;
          case '\t':
            sb.append("\\t");
            break;
          default:
            if (c < 0x20) {
              sb.append(String.format("\\u%04x", (int) c));
            } else {
              sb.append(c);
            }
        }
      }
      sb.append('"');
    }

    static final class Parser {
      private final String text;
      private int index;

      Parser(String text) {
        this.text = text;
      }

      boolean done() {
        return index >= text.length();
      }

      void skipWs() {
        while (index < text.length() && Character.isWhitespace(text.charAt(index))) {
          index++;
        }
      }

      Object parseValue() {
        skipWs();
        if (done()) {
          throw new IllegalArgumentException("Unexpected end of JSON");
        }
        char c = text.charAt(index);
        if (c == '{') {
          return parseObject();
        }
        if (c == '[') {
          return parseArray();
        }
        if (c == '"') {
          return parseString();
        }
        if (c == 't' || c == 'f') {
          return parseBoolean();
        }
        if (c == 'n') {
          return parseNull();
        }
        return parseNumber();
      }

      Map<String, Object> parseObject() {
        expect('{');
        Map<String, Object> map = new LinkedHashMap<>();
        skipWs();
        if (peek('}')) {
          index++;
          return map;
        }
        while (true) {
          skipWs();
          String key = parseString();
          skipWs();
          expect(':');
          Object value = parseValue();
          map.put(key, value);
          skipWs();
          if (peek('}')) {
            index++;
            return map;
          }
          expect(',');
        }
      }

      List<Object> parseArray() {
        expect('[');
        List<Object> list = new ArrayList<>();
        skipWs();
        if (peek(']')) {
          index++;
          return list;
        }
        while (true) {
          list.add(parseValue());
          skipWs();
          if (peek(']')) {
            index++;
            return list;
          }
          expect(',');
        }
      }

      String parseString() {
        expect('"');
        StringBuilder sb = new StringBuilder();
        while (!done()) {
          char c = text.charAt(index++);
          if (c == '"') {
            return sb.toString();
          }
          if (c == '\\') {
            if (done()) {
              throw new IllegalArgumentException("Unterminated escape");
            }
            char esc = text.charAt(index++);
            switch (esc) {
              case '"':
              case '\\':
              case '/':
                sb.append(esc);
                break;
              case 'b':
                sb.append('\b');
                break;
              case 'f':
                sb.append('\f');
                break;
              case 'n':
                sb.append('\n');
                break;
              case 'r':
                sb.append('\r');
                break;
              case 't':
                sb.append('\t');
                break;
              case 'u':
                if (index + 4 > text.length()) {
                  throw new IllegalArgumentException("Invalid unicode escape");
                }
                sb.append((char) Integer.parseInt(text.substring(index, index + 4), 16));
                index += 4;
                break;
              default:
                throw new IllegalArgumentException("Invalid escape: \\" + esc);
            }
          } else {
            sb.append(c);
          }
        }
        throw new IllegalArgumentException("Unterminated string");
      }

      Boolean parseBoolean() {
        if (text.startsWith("true", index)) {
          index += 4;
          return true;
        }
        if (text.startsWith("false", index)) {
          index += 5;
          return false;
        }
        throw new IllegalArgumentException("Invalid boolean");
      }

      Object parseNull() {
        if (text.startsWith("null", index)) {
          index += 4;
          return null;
        }
        throw new IllegalArgumentException("Invalid null");
      }

      Number parseNumber() {
        int start = index;
        if (peek('-')) {
          index++;
        }
        while (index < text.length() && Character.isDigit(text.charAt(index))) {
          index++;
        }
        boolean decimal = false;
        if (peek('.')) {
          decimal = true;
          index++;
          while (index < text.length() && Character.isDigit(text.charAt(index))) {
            index++;
          }
        }
        if (peek('e') || peek('E')) {
          decimal = true;
          index++;
          if (peek('+') || peek('-')) {
            index++;
          }
          while (index < text.length() && Character.isDigit(text.charAt(index))) {
            index++;
          }
        }
        String raw = text.substring(start, index);
        if (decimal) {
          return Double.valueOf(raw);
        }
        try {
          return Long.valueOf(raw);
        } catch (NumberFormatException ex) {
          return new BigDecimal(raw);
        }
      }

      void expect(char c) {
        skipWs();
        if (done() || text.charAt(index) != c) {
          throw new IllegalArgumentException("Expected '" + c + "'");
        }
        index++;
      }

      boolean peek(char c) {
        return index < text.length() && text.charAt(index) == c;
      }
    }
  }
}

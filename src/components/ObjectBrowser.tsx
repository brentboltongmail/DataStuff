import { useEffect, useMemo, useRef, useState } from "react";
import type { DbColumn, DbObject, DbObjectType } from "../types";

const FILTER_KEY = "oracle-ide.objectFilter";
const COLLAPSED_KEY = "oracle-ide.objectGroupsCollapsed";

type GroupKey = DbObjectType;

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw)
      return {
        TABLE: false,
        VIEW: false,
        SYNONYM: false,
        INDEX: false,
        PACKAGE_BODY: false,
        GRANT: false,
      };
    const parsed = JSON.parse(raw) as Partial<Record<string, boolean>>;
    return {
      TABLE: !!parsed.TABLE,
      VIEW: !!parsed.VIEW,
      SYNONYM: !!parsed.SYNONYM,
      INDEX: !!parsed.INDEX,
      PACKAGE_BODY: !!parsed.PACKAGE_BODY,
      GRANT: !!parsed.GRANT,
    };
  } catch {
    return {
      TABLE: false,
      VIEW: false,
      SYNONYM: false,
      INDEX: false,
      PACKAGE_BODY: false,
      GRANT: false,
    };
  }
}

interface Props {
  connected: boolean;
  refreshKey: number;
  onInsertSql: (sql: string) => void;
  onOpenSelect: (objectName: string, objectType?: DbObjectType) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ObjectBrowser({
  connected,
  refreshKey,
  onInsertSql,
  onOpenSelect,
  collapsed,
  onToggleCollapse,
}: Props) {
  const [objects, setObjects] = useState<DbObject[]>([]);
  const [filter, setFilter] = useState(
    () => localStorage.getItem(FILTER_KEY) ?? "",
  );
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedGroups);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, DbColumn[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clickTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, filter);
  }, [filter]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  useEffect(() => {
    if (!connected) {
      setObjects([]);
      setColumns({});
      setExpanded(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    window.oracle
      .listObjects()
      .then((next) => {
        if (!cancelled) setObjects(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, refreshKey]);

  const grouped = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const filtered = q
      ? objects.filter((obj) => obj.name.toUpperCase().includes(q))
      : objects;
    const tables = filtered.filter((obj) => obj.type === "TABLE");
    const views = filtered.filter((obj) => obj.type === "VIEW");
    const synonyms = filtered.filter((obj) => obj.type === "SYNONYM");
    const indexes = filtered.filter((obj) => obj.type === "INDEX");
    const packageBodies = filtered.filter(
      (obj) => obj.type === "PACKAGE_BODY" || obj.type === "PACKAGE BODY",
    );
    const grants = filtered.filter((obj) => obj.type === "GRANT");
    return { tables, views, synonyms, indexes, packageBodies, grants };
  }, [objects, filter]);

  const toggleGroup = (type: GroupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const toggleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (columns[name]) return;
    try {
      const cols = await window.oracle.listColumns(name);
      setColumns((prev) => ({ ...prev, [name]: cols }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderGroup = (label: string, type: GroupKey, items: DbObject[]) => {
    const groupCollapsed = collapsedGroups[type];
    return (
      <div className={`object-group${groupCollapsed ? " collapsed" : ""}`} key={type}>
        <button
          type="button"
          className="object-group-title"
          onClick={() => toggleGroup(type)}
          aria-expanded={!groupCollapsed}
          title={groupCollapsed ? `Expand ${label}` : `Collapse ${label}`}
        >
          <span className="object-group-label">
            <span className="object-group-chevron" aria-hidden>
              {groupCollapsed ? "▸" : "▾"}
            </span>
            {label}
          </span>
          <span>{items.length}</span>
        </button>
        {groupCollapsed ? null : items.length === 0 ? (
          <div className="object-empty">None</div>
        ) : (
          <ul className="object-list">
            {items.map((obj) => (
              <li key={obj.name}>
                <div className="object-row">
                  <button
                    type="button"
                    className="object-expand"
                    onClick={() => void toggleExpand(obj.name)}
                    title="Show details"
                  >
                    {expanded === obj.name ? "▾" : "▸"}
                  </button>
                  <button
                    type="button"
                    className="object-name"
                    title="Click to insert name · double-click to view"
                    onClick={() => {
                      const key = obj.name;
                      const existing = clickTimers.current[key];
                      if (existing) window.clearTimeout(existing);
                      clickTimers.current[key] = window.setTimeout(() => {
                        onInsertSql(obj.name);
                        delete clickTimers.current[key];
                      }, 250);
                    }}
                    onDoubleClick={() => {
                      const existing = clickTimers.current[obj.name];
                      if (existing) {
                        window.clearTimeout(existing);
                        delete clickTimers.current[obj.name];
                      }
                      onOpenSelect(obj.name, obj.type);
                    }}
                  >
                    {obj.name}
                  </button>
                </div>
                {expanded === obj.name ? (
                  <ul className="column-list">
                    {(columns[obj.name] ?? []).map((col) => (
                      <li
                        key={col.name}
                        title={`${col.dataType}${col.nullable ? "" : " NOT NULL"}`}
                      >
                        <span>{col.name}</span>
                        <em>{col.dataType}</em>
                      </li>
                    ))}
                    {!columns[obj.name] ? (
                      <li className="object-empty">Loading…</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside className="object-browser collapsed" title="Unhide Objects Window">
        <button
          type="button"
          className="object-browser-toggle-btn unhide-btn"
          onClick={onToggleCollapse}
          title="Unhide Objects Window"
          aria-label="Unhide Objects Window"
        >
          ◀ <span className="vertical-label">Objects</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="object-browser">
      <div className="object-browser-header">
        <div className="object-browser-title-group">
          <strong>Objects</strong>
          <button
            type="button"
            className="ghost object-refresh-btn"
            disabled={!connected || loading}
            onClick={() => {
              setColumns({});
              setExpanded(null);
              if (!connected) return;
              setLoading(true);
              window.oracle
                .listObjects()
                .then(setObjects)
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setLoading(false));
            }}
            title="Refresh database object browser list"
            aria-label="Refresh Objects"
          >
            ↻
          </button>
        </div>
        <div className="header-actions">
          {onToggleCollapse ? (
            <button
              type="button"
              className="ghost object-browser-toggle-btn hide-btn"
              onClick={onToggleCollapse}
              title="Hide Objects Window"
              aria-label="Hide Objects Window"
            >
              ▶
            </button>
          ) : null}
        </div>
      </div>
      <input
        className="object-filter"
        placeholder="Filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={!connected}
      />
      <div className="object-browser-body">
        {!connected ? (
          <div className="object-empty">Connect to browse database objects.</div>
        ) : loading ? (
          <div className="object-empty">Loading…</div>
        ) : error ? (
          <div className="error-state compact">{error}</div>
        ) : (
          <>
            {renderGroup("Tables", "TABLE", grouped.tables)}
            {renderGroup("Views", "VIEW", grouped.views)}
            {renderGroup("Synonyms", "SYNONYM", grouped.synonyms)}
            {renderGroup("Indexes", "INDEX", grouped.indexes)}
            {renderGroup("Package Bodies", "PACKAGE_BODY", grouped.packageBodies)}
            {renderGroup("Grants", "GRANT", grouped.grants)}
          </>
        )}
      </div>
      <div className="object-hint">Click name → insert · double-click → view</div>
    </aside>
  );
}

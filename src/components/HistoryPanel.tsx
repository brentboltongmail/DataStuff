import type { HistoryEntry } from "../types";

interface Props {
  entries: HistoryEntry[];
  onRestore: (sql: string) => void;
  onClear: () => void;
}

function preview(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 120);
}

export default function HistoryPanel({ entries, onRestore, onClear }: Props) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        Successful and failed statements will appear here after you Run.
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-toolbar">
        <span>{entries.length} statements</span>
        <button type="button" className="ghost" onClick={onClear}>
          Clear
        </button>
      </div>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={`history-item ${entry.ok ? "ok" : "fail"}`}
              onClick={() => onRestore(entry.sql)}
              title="Click to load into the active tab"
            >
              <div className="history-meta">
                <span>{new Date(entry.ranAt).toLocaleString()}</span>
                <span>{entry.summary}</span>
              </div>
              <code>{preview(entry.sql)}</code>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

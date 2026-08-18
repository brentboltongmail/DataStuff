import React, { useMemo, useState } from "react";
import type { QueryResult } from "../types";
import { formatCell } from "../csv";

export interface DiffSource {
  id: string;
  label: string;
  sql?: string;
  result: QueryResult;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sources: DiffSource[];
  defaultSourceAId?: string;
  defaultSourceBId?: string;
}

type DiffFilter = "all" | "diffs" | "added" | "removed" | "modified";
type ViewMode = "side-by-side" | "unified";

interface DiffRowResult {
  type: "added" | "removed" | "modified" | "unchanged";
  key: string;
  rowA?: unknown[];
  rowB?: unknown[];
  changedColumns: Set<string>;
}

export default function ResultDiffModal({
  isOpen,
  onClose,
  sources,
  defaultSourceAId,
  defaultSourceBId,
}: Props) {
  const [sourceAId, setSourceAId] = useState<string>(
    defaultSourceAId || sources[0]?.id || "",
  );
  const [sourceBId, setSourceBId] = useState<string>(
    defaultSourceBId || sources[1]?.id || sources[0]?.id || "",
  );
  const [keyColumn, setKeyColumn] = useState<string>("__INDEX__");
  const [filter, setFilter] = useState<DiffFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

  const sourceA = useMemo(
    () => sources.find((s) => s.id === sourceAId) || sources[0],
    [sources, sourceAId],
  );
  const sourceB = useMemo(
    () => sources.find((s) => s.id === sourceBId) || sources[1] || sources[0],
    [sources, sourceBId],
  );

  // Common union of column names between A & B
  const allColumns = useMemo(() => {
    const colsA = sourceA?.result.columns.map((c) => c.name) || [];
    const colsB = sourceB?.result.columns.map((c) => c.name) || [];
    const set = new Set([...colsA, ...colsB]);
    return Array.from(set);
  }, [sourceA, sourceB]);

  // Compute diffs
  const diffRows = useMemo<DiffRowResult[]>(() => {
    if (!sourceA?.result || !sourceB?.result) return [];

    const rowsA = sourceA.result.rows;
    const rowsB = sourceB.result.rows;
    const colsA = sourceA.result.columns.map((c) => c.name);
    const colsB = sourceB.result.columns.map((c) => c.name);

    const keyIdxA = keyColumn === "__INDEX__" ? -1 : colsA.indexOf(keyColumn);
    const keyIdxB = keyColumn === "__INDEX__" ? -1 : colsB.indexOf(keyColumn);

    const diffs: DiffRowResult[] = [];

    // Helper to format value for comparison
    const valToStr = (val: unknown): string =>
      val === null || val === undefined ? "__NULL__" : String(formatCell(val));

    if (keyColumn === "__INDEX__" || keyIdxA === -1 || keyIdxB === -1) {
      // Index-based comparison
      const maxLen = Math.max(rowsA.length, rowsB.length);
      for (let i = 0; i < maxLen; i++) {
        const rA = rowsA[i];
        const rB = rowsB[i];

        if (rA && !rB) {
          diffs.push({
            type: "removed",
            key: `Row #${i + 1}`,
            rowA: rA,
            changedColumns: new Set(allColumns),
          });
        } else if (!rA && rB) {
          diffs.push({
            type: "added",
            key: `Row #${i + 1}`,
            rowB: rB,
            changedColumns: new Set(allColumns),
          });
        } else if (rA && rB) {
          const changed = new Set<string>();
          for (const col of allColumns) {
            const idxA = colsA.indexOf(col);
            const idxB = colsB.indexOf(col);
            const valA = idxA !== -1 ? rA[idxA] : undefined;
            const valB = idxB !== -1 ? rB[idxB] : undefined;
            if (valToStr(valA) !== valToStr(valB)) {
              changed.add(col);
            }
          }
          if (changed.size > 0) {
            diffs.push({
              type: "modified",
              key: `Row #${i + 1}`,
              rowA: rA,
              rowB: rB,
              changedColumns: changed,
            });
          } else {
            diffs.push({
              type: "unchanged",
              key: `Row #${i + 1}`,
              rowA: rA,
              rowB: rB,
              changedColumns: new Set(),
            });
          }
        }
      }
    } else {
      // Key Column matching strategy
      const mapA = new Map<string, unknown[]>();
      for (let i = 0; i < rowsA.length; i++) {
        const k = valToStr(rowsA[i][keyIdxA]);
        mapA.set(k, rowsA[i]);
      }

      const mapB = new Map<string, unknown[]>();
      for (let i = 0; i < rowsB.length; i++) {
        const k = valToStr(rowsB[i][keyIdxB]);
        mapB.set(k, rowsB[i]);
      }

      const allKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));

      for (const k of allKeys) {
        const rA = mapA.get(k);
        const rB = mapB.get(k);

        if (rA && !rB) {
          diffs.push({
            type: "removed",
            key: k,
            rowA: rA,
            changedColumns: new Set(allColumns),
          });
        } else if (!rA && rB) {
          diffs.push({
            type: "added",
            key: k,
            rowB: rB,
            changedColumns: new Set(allColumns),
          });
        } else if (rA && rB) {
          const changed = new Set<string>();
          for (const col of allColumns) {
            const idxA = colsA.indexOf(col);
            const idxB = colsB.indexOf(col);
            const valA = idxA !== -1 ? rA[idxA] : undefined;
            const valB = idxB !== -1 ? rB[idxB] : undefined;
            if (valToStr(valA) !== valToStr(valB)) {
              changed.add(col);
            }
          }
          if (changed.size > 0) {
            diffs.push({
              type: "modified",
              key: k,
              rowA: rA,
              rowB: rB,
              changedColumns: changed,
            });
          } else {
            diffs.push({
              type: "unchanged",
              key: k,
              rowA: rA,
              rowB: rB,
              changedColumns: new Set(),
            });
          }
        }
      }
    }

    return diffs;
  }, [sourceA, sourceB, keyColumn, allColumns]);

  // Statistics
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;
    for (const r of diffRows) {
      if (r.type === "added") added++;
      else if (r.type === "removed") removed++;
      else if (r.type === "modified") modified++;
      else if (r.type === "unchanged") unchanged++;
    }
    return { added, removed, modified, unchanged, totalDiffs: added + removed + modified };
  }, [diffRows]);

  // Filtered rows for display
  const displayedRows = useMemo(() => {
    return diffRows.filter((r) => {
      if (filter === "diffs") return r.type !== "unchanged";
      if (filter === "added") return r.type === "added";
      if (filter === "removed") return r.type === "removed";
      if (filter === "modified") return r.type === "modified";
      return true;
    });
  }, [diffRows, filter]);

  if (!isOpen) return null;

  const colsA = sourceA?.result.columns.map((c) => c.name) || [];
  const colsB = sourceB?.result.columns.map((c) => c.name) || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-window diff-modal-window"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <h2>⚖️ Query Result Diff Viewer</h2>
            <span className="diff-stats-badge">
              {stats.totalDiffs === 0
                ? "✨ Identical Datasets"
                : `⚡ ${stats.totalDiffs} Differences Found`}
            </span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body diff-modal-body">
          {/* Controls Bar */}
          <div className="diff-controls-bar">
            <div className="diff-source-picker">
              <label>
                Source A (Base):
                <select
                  value={sourceAId}
                  onChange={(e) => setSourceAId(e.target.value)}
                >
                  {sources.map((s) => (
                    <option key={`a-${s.id}`} value={s.id}>
                      {s.label} ({s.result.rows.length} rows)
                    </option>
                  ))}
                </select>
              </label>

              <span className="diff-vs-label">VS</span>

              <label>
                Source B (Target):
                <select
                  value={sourceBId}
                  onChange={(e) => setSourceBId(e.target.value)}
                >
                  {sources.map((s) => (
                    <option key={`b-${s.id}`} value={s.id}>
                      {s.label} ({s.result.rows.length} rows)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="diff-strategy-picker">
              <label>
                Match By:
                <select
                  value={keyColumn}
                  onChange={(e) => setKeyColumn(e.target.value)}
                >
                  <option value="__INDEX__">Row Index (1-to-1 Position)</option>
                  {allColumns.map((col) => (
                    <option key={col} value={col}>
                      Column: {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Metrics Badges */}
          <div className="diff-metrics-bar">
            <button
              type="button"
              className={`metric-pill ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All Rows ({diffRows.length})
            </button>
            <button
              type="button"
              className={`metric-pill diffs ${filter === "diffs" ? "active" : ""}`}
              onClick={() => setFilter("diffs")}
            >
              Total Diffs ({stats.totalDiffs})
            </button>
            <button
              type="button"
              className={`metric-pill added ${filter === "added" ? "active" : ""}`}
              onClick={() => setFilter("added")}
            >
              + Added ({stats.added})
            </button>
            <button
              type="button"
              className={`metric-pill removed ${filter === "removed" ? "active" : ""}`}
              onClick={() => setFilter("removed")}
            >
              - Removed ({stats.removed})
            </button>
            <button
              type="button"
              className={`metric-pill modified ${filter === "modified" ? "active" : ""}`}
              onClick={() => setFilter("modified")}
            >
              ~ Modified ({stats.modified})
            </button>

            <div className="view-mode-toggle">
              <button
                type="button"
                className={`toggle-btn ${viewMode === "side-by-side" ? "active" : ""}`}
                onClick={() => setViewMode("side-by-side")}
                title="Side by Side Grid View"
              >
                Columns
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === "unified" ? "active" : ""}`}
                onClick={() => setViewMode("unified")}
                title="Unified Line Diff View"
              >
                Unified
              </button>
            </div>
          </div>

          {/* Diff Grid Table */}
          <div className="diff-table-container">
            {displayedRows.length === 0 ? (
              <div className="diff-empty-state">
                {filter === "diffs" && stats.totalDiffs === 0
                  ? "🎉 The query results match perfectly! No differences detected."
                  : "No rows match the selected filter."}
              </div>
            ) : (
              <table className={`diff-table mode-${viewMode}`}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Status</th>
                    <th style={{ width: 120 }}>Key / Row</th>
                    {allColumns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((item, rowIdx) => {
                    const statusSymbol =
                      item.type === "added"
                        ? "+"
                        : item.type === "removed"
                          ? "-"
                          : item.type === "modified"
                            ? "~"
                            : "=";

                    return (
                      <tr
                        key={`${item.key}-${rowIdx}`}
                        className={`diff-row row-${item.type}`}
                      >
                        <td className="col-status">
                          <span className={`status-badge badge-${item.type}`}>
                            {statusSymbol}
                          </span>
                        </td>
                        <td className="col-key">{item.key}</td>
                        {allColumns.map((col) => {
                          const isChanged = item.changedColumns.has(col);
                          const idxA = colsA.indexOf(col);
                          const idxB = colsB.indexOf(col);
                          const valA =
                            item.rowA && idxA !== -1 ? item.rowA[idxA] : undefined;
                          const valB =
                            item.rowB && idxB !== -1 ? item.rowB[idxB] : undefined;

                          const strA =
                            valA === null
                              ? "NULL"
                              : valA === undefined
                                ? "—"
                                : formatCell(valA);
                          const strB =
                            valB === null
                              ? "NULL"
                              : valB === undefined
                                ? "—"
                                : formatCell(valB);

                          return (
                            <td
                              key={col}
                              className={`col-data ${isChanged ? "cell-changed" : ""}`}
                            >
                              {item.type === "modified" && isChanged ? (
                                <div className="diff-cell-split">
                                  <span className="val-old" title={`A: ${strA}`}>
                                    {strA}
                                  </span>
                                  <span className="diff-arrow">➔</span>
                                  <span className="val-new" title={`B: ${strB}`}>
                                    {strB}
                                  </span>
                                </div>
                              ) : item.type === "removed" ? (
                                <span className="val-removed">{strA}</span>
                              ) : (
                                <span className="val-normal">
                                  {item.type === "added" ? strB : strA}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

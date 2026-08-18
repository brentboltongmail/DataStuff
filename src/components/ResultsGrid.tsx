import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { formatCell, isNullCell } from "../csv";
import { isRowIdColumn, parseEditValue } from "../editableQuery";
import type { CellEdit, QueryResult } from "../types";

export type { CellEdit };
export type GridDensity = "normal" | "compact" | "crammed";

/** Crammed header labels are rotated this many degrees from horizontal. */
const CRAMMED_HEADER_ANGLE_DEG = 30;

interface Props {
  result: QueryResult;
  density: GridDensity;
  editable: boolean;
  pendingEdits: Record<string, CellEdit>;
  onEdit: (edit: CellEdit) => void;
  /** Used to recompute crammed header height when app font scale changes. */
  fontScale?: number;
  /** Size columns to cell content instead of header names (normal/compact). */
  fitColumnsToContent?: boolean;
  /** Optional per-cell title override (e.g. index definitions in explain plan). */
  getCellTitle?: (
    rowIndex: number,
    columnIndex: number,
    columnName: string,
    value: unknown,
    text: string,
  ) => string | undefined;
}

export function cellEditKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

let sharedCanvasCtx: CanvasRenderingContext2D | null = null;

function getSharedCanvasContext(): CanvasRenderingContext2D | null {
  if (!sharedCanvasCtx && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    sharedCanvasCtx = canvas.getContext("2d");
  }
  return sharedCanvasCtx;
}

function crammedHeaderHeightPx(columnNames: string[], fontScale: number): number {
  if (columnNames.length === 0) return 32;
  const ctx = getSharedCanvasContext();
  const fontSize = 9 * fontScale;
  let maxWidth = 0;
  if (ctx) {
    ctx.font = `${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
    for (const name of columnNames) {
      maxWidth = Math.max(maxWidth, ctx.measureText(name).width);
    }
  } else {
    maxWidth = Math.max(...columnNames.map((name) => name.length)) * fontSize * 0.6;
  }
  const radians = (CRAMMED_HEADER_ANGLE_DEG * Math.PI) / 180;
  return Math.max(36, Math.ceil(maxWidth * Math.sin(radians)) + 32);
}

function gridFontSizePx(density: GridDensity, fontScale: number): number {
  switch (density) {
    case "crammed":
      return 9 * fontScale;
    case "compact":
      return 11 * fontScale;
    default:
      return 12 * fontScale;
  }
}

/** Minimum column width ≈ 4 monospace characters. */
function minColWidthPx(density: GridDensity, fontScale: number): number {
  const fontSize = gridFontSizePx(density, fontScale);
  const ctx = getSharedCanvasContext();
  if (ctx) {
    ctx.font = `${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
    return Math.ceil(ctx.measureText("0000").width);
  }
  return Math.ceil(fontSize * 0.6 * 4);
}

/** Cap data-driven width at this many characters in normal density. */
const NORMAL_MAX_DATA_CHARS = 50;

let currentCachedFont = "";

function measureTextPx(
  text: string,
  fontSize: number,
  fontWeight: number | string = 400,
  letterSpacingEm = 0,
): number {
  const ctx = getSharedCanvasContext();
  if (!ctx) {
    return Math.ceil(text.length * fontSize * 0.6);
  }
  const fontStr = `${fontWeight} ${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
  if (currentCachedFont !== fontStr) {
    currentCachedFont = fontStr;
    ctx.font = fontStr;
  }
  let width = ctx.measureText(text).width;
  if (letterSpacingEm > 0 && text.length > 1) {
    width += letterSpacingEm * fontSize * (text.length - 1);
  }
  return Math.ceil(width);
}

function computeNormalColWidths(
  columns: { col: { name: string }; index: number }[],
  rows: unknown[][],
  pendingEdits: Record<string, CellEdit>,
  fontScale: number,
): Record<string, number> {
  const bodyFont = gridFontSizePx("normal", fontScale);
  const headerFont = 11 * fontScale;
  const padX = 10; // horizontal padding (2px left + 2px right + 6px breathing room for handle)
  const minW = minColWidthPx("normal", fontScale);
  
  // Width corresponding to 50 monospace characters
  const widthOf50Chars = measureTextPx("0".repeat(NORMAL_MAX_DATA_CHARS), bodyFont) + padX;

  const widths: Record<string, number> = {};

  for (const { col, index } of columns) {
    // Width of column header (at least header width)
    const headerText = col.name.toUpperCase();
    const headerW = measureTextPx(headerText, headerFont, 600, 0.04) + padX;

    // Measured data width across rows
    let rawMaxDataW = 0;
    const sampleCount = Math.min(rows.length, 500);
    for (let rowIndex = 0; rowIndex < sampleCount; rowIndex++) {
      const pending = pendingEdits[cellEditKey(rowIndex, index)];
      const cell = pending ? pending.newValue : rows[rowIndex]?.[index];
      const text = isNullCell(cell) ? "NULL" : formatCell(cell);
      if (text) {
        const cellW = measureTextPx(text, bodyFont) + padX;
        if (cellW > rawMaxDataW) {
          rawMaxDataW = cellW;
        }
      }
    }

    // Lesser of data width and 50 characters
    const cappedDataW = Math.min(rawMaxDataW, widthOf50Chars);

    // Column width is at least header width and lesser of data width and 50 chars
    widths[col.name] = Math.max(minW, headerW, cappedDataW);
  }
  return widths;
}

/** Compact density: column width is exactly the header name width. */
function computeCompactColWidths(
  columns: { col: { name: string }; index: number }[],
  fontScale: number,
): Record<string, number> {
  const headerFont = 10 * fontScale;
  const padX = 10; // compact padding 2px 2px + border breathing room
  const minW = minColWidthPx("compact", fontScale);
  const widths: Record<string, number> = {};

  for (const { col } of columns) {
    const headerText = col.name.toUpperCase();
    const headerW =
      measureTextPx(headerText, headerFont, 600, 0.02) + padX;
    widths[col.name] = Math.max(minW, headerW);
  }
  return widths;
}

function isDateColumn(rows: unknown[][], colIndex: number): boolean {
  let sampled = 0;
  const sampleCount = Math.min(rows.length, 100);
  for (let r = 0; r < sampleCount; r++) {
    const val = rows[r]?.[colIndex];
    if (val === null || val === undefined) continue;
    sampled++;
    if (val instanceof Date) return true;
    const str = String(val);
    if (/^\d{4}[-/]\d{2}[-/]\d{2}([ T]\d{2}:\d{2}:\d{2})?/.test(str)) {
      return true;
    }
    if (sampled >= 20) break;
  }
  return false;
}

/** Crammed density: Date columns use max date width; non-date columns use the average width of the first 100 rows. */
function computeCrammedColWidths(
  columns: { col: { name: string }; index: number }[],
  rows: unknown[][],
  pendingEdits: Record<string, CellEdit>,
  fontScale: number,
): Record<string, number> {
  const bodyFont = gridFontSizePx("crammed", fontScale);
  const padX = 10;
  const minW = minColWidthPx("crammed", fontScale);
  const widths: Record<string, number> = {};

  for (const { col, index } of columns) {
    const isDate = isDateColumn(rows, index);

    if (isDate) {
      // Date type columns are exactly 20 characters wide + cell padding
      const widthOf20Chars = measureTextPx("0".repeat(20), bodyFont) + padX;
      widths[col.name] = Math.max(minW, widthOf20Chars);
    } else {
      // Non-date columns: average width of the first 100 rows of data in each column
      let totalWidth = 0;
      let sampleCount = 0;
      const limit = Math.min(rows.length, 100);

      for (let r = 0; r < limit; r++) {
        const pending = pendingEdits[cellEditKey(r, index)];
        const cell = pending ? pending.newValue : rows[r]?.[index];
        const text = isNullCell(cell) ? "NULL" : formatCell(cell);
        if (text) {
          const w = measureTextPx(text, bodyFont);
          totalWidth += w;
          sampleCount++;
        }
      }

      if (sampleCount > 0) {
        const avgW = totalWidth / sampleCount + padX;
        widths[col.name] = Math.max(minW, Math.round(avgW));
      } else {
        widths[col.name] = minW;
      }
    }
  }

  return widths;
}

function computeAutoColWidths(
  density: GridDensity,
  columns: { col: { name: string }; index: number }[],
  rows: unknown[][],
  pendingEdits: Record<string, CellEdit>,
  fontScale: number,
): Record<string, number> {
  if (density === "compact") {
    return computeCompactColWidths(columns, fontScale);
  }
  if (density === "crammed") {
    return computeCrammedColWidths(columns, rows, pendingEdits, fontScale);
  }
  return computeNormalColWidths(columns, rows, pendingEdits, fontScale);
}

export default function ResultsGrid({
  result,
  density,
  editable,
  pendingEdits,
  onEdit,
  fontScale = 1,
  fitColumnsToContent = false,
  getCellTitle,
}: Props) {
  const [editing, setEditing] = useState<{
    rowIndex: number;
    columnIndex: number;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const colWidthsRef = useRef(colWidths);
  const rowNumWidthRef = useRef(52);
  const userResizedRef = useRef<Set<string>>(new Set());
  const resizeRef = useRef<{
    name: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  colWidthsRef.current = colWidths;

  const visibleColumns = useMemo(
    () =>
      result.columns
        .map((col, index) => ({ col, index }))
        .filter(({ col }) => !isRowIdColumn(col.name)),
    [result.columns],
  );

  const headerNames = useMemo(
    () => visibleColumns.map(({ col }) => col.name),
    [visibleColumns],
  );

  const columnKey = useMemo(
    () => headerNames.join("\0"),
    [headerNames],
  );

  const [sortState, setSortState] = useState<{
    colIndex: number;
    colName: string;
    direction: "asc" | "desc";
  } | null>(null);

  // New result shape → drop custom widths / resize memory / sort state.
  useEffect(() => {
    userResizedRef.current.clear();
    setColWidths({});
    setSortState(null);
  }, [columnKey]);

  // Leaving auto-sized densities: drop widths on density/fit toggle.
  useEffect(() => {
    userResizedRef.current.clear();
    setColWidths({});
  }, [density, fitColumnsToContent]);

  // Normal, Compact, & Crammed auto width calculation.
  useLayoutEffect(() => {
    if (fitColumnsToContent) {
      return;
    }
    const auto = computeAutoColWidths(
      density,
      visibleColumns,
      result.rows,
      pendingEdits,
      fontScale,
    );
    setColWidths((prev) => {
      const next = { ...auto };
      for (const name of userResizedRef.current) {
        if (prev[name] != null) next[name] = prev[name];
      }
      return next;
    });
  }, [
    density,
    fitColumnsToContent,
    fontScale,
    visibleColumns,
    result.rows,
    pendingEdits,
    columnKey,
  ]);

  const crammedHeight = useMemo(() => {
    if (density !== "crammed") return undefined;
    return crammedHeaderHeightPx(headerNames, fontScale);
  }, [density, headerNames, fontScale]);

  useLayoutEffect(() => {
    if (density !== "crammed" || !headerRowRef.current || !crammedHeight) return;
    headerRowRef.current.style.height = `${crammedHeight}px`;
  }, [density, crammedHeight]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const snapshotWidthsIfNeeded = useCallback(() => {
    if (Object.keys(colWidthsRef.current).length > 0) return colWidthsRef.current;
    const table = tableRef.current;
    if (!table) return {};

    // Body cells drive real column width (crammed headers are width:0).
    const bodyRow = table.querySelector("tbody tr");
    const headerCells =
      headerRowRef.current?.querySelectorAll<HTMLElement>("th:not(.row-num)") ??
      [];
    const bodyCells =
      bodyRow?.querySelectorAll<HTMLElement>("td:not(.row-num)") ?? [];

    const rowNumCell =
      bodyRow?.querySelector<HTMLElement>("td.row-num") ??
      headerRowRef.current?.querySelector<HTMLElement>("th.row-num");
    if (rowNumCell) {
      rowNumWidthRef.current = Math.round(rowNumCell.getBoundingClientRect().width);
    }

    const snapshot: Record<string, number> = {};
    visibleColumns.forEach(({ col }, index) => {
      const bodyWidth = bodyCells[index]?.getBoundingClientRect().width ?? 0;
      const headerWidth = headerCells[index]?.getBoundingClientRect().width ?? 0;
      // Prefer the larger of body/header so we don't collapse to crammed header zeros.
      snapshot[col.name] = Math.round(Math.max(bodyWidth, headerWidth, 1));
    });
    return snapshot;
  }, [visibleColumns]);

  const endResize = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    document.body.classList.remove("is-col-resizing");
  }, []);

  const onResizePointerDown = useCallback(
    (name: string, event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const snapshot = snapshotWidthsIfNeeded();
      const startWidth = snapshot[name] ?? 1;
      // Lock every column to its current pixel width so fixed layout
      // cannot redistribute space while this one is dragged.
      setColWidths({ ...snapshot, [name]: startWidth });
      colWidthsRef.current = { ...snapshot, [name]: startWidth };
      userResizedRef.current.add(name);
      resizeRef.current = {
        name,
        startX: event.clientX,
        startWidth,
      };
      document.body.classList.add("is-col-resizing");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [snapshotWidthsIfNeeded],
  );

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = resizeRef.current;
      if (!drag) return;
      const minWidth = minColWidthPx(density, fontScale);
      const next = Math.max(
        minWidth,
        Math.round(drag.startWidth + (event.clientX - drag.startX)),
      );
      userResizedRef.current.add(drag.name);
      setColWidths((prev) => ({ ...prev, [drag.name]: next }));
    },
    [density, fontScale],
  );

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (resizeRef.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
      }
      endResize();
    },
    [endResize],
  );

  const resetColumnWidth = useCallback(
    (name: string) => {
      userResizedRef.current.delete(name);
      if (
        (density === "normal" || density === "compact") &&
        !fitColumnsToContent
      ) {
        const auto = computeAutoColWidths(
          density,
          visibleColumns,
          result.rows,
          pendingEdits,
          fontScale,
        );
        setColWidths((prev) => ({
          ...prev,
          [name]: auto[name] ?? minColWidthPx(density, fontScale),
        }));
        return;
      }
      setColWidths((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [
      density,
      fitColumnsToContent,
      visibleColumns,
      result.rows,
      pendingEdits,
      fontScale,
    ],
  );

  const beginEdit = (rowIndex: number, columnIndex: number) => {
    if (!editable) return;
    const column = result.columns[columnIndex];
    if (!column || isRowIdColumn(column.name)) return;
    const pending = pendingEdits[cellEditKey(rowIndex, columnIndex)];
    const value = pending ? pending.newValue : result.rows[rowIndex]?.[columnIndex];
    setDraft(isNullCell(value) ? "" : formatCell(value));
    setEditing({ rowIndex, columnIndex });
  };

  const commitEdit = () => {
    if (!editing) return;
    const { rowIndex, columnIndex } = editing;
    const column = result.columns[columnIndex];
    const original = result.rows[rowIndex]?.[columnIndex];
    const textToCommit = inputRef.current ? inputRef.current.value : draft;
    setEditing(null);

    const newValue = parseEditValue(textToCommit, original);
    onEdit({
      rowIndex,
      columnIndex,
      columnName: column.name,
      oldValue: original,
      newValue,
    });
  };

  const cancelEdit = () => setEditing(null);

  const handleHeaderClick = useCallback((colIndex: number, colName: string) => {
    setSortState((prev) => {
      if (!prev || prev.colIndex !== colIndex) {
        return { colIndex, colName, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { colIndex, colName, direction: "desc" };
      }
      return null;
    });
  }, []);

  const sortedRowIndices = useMemo(() => {
    const indices = result.rows.map((_, idx) => idx);
    if (!sortState) return indices;

    const { colIndex, direction } = sortState;

    return indices.slice().sort((aIdx, bIdx) => {
      const rawA = pendingEdits[cellEditKey(aIdx, colIndex)]
        ? pendingEdits[cellEditKey(aIdx, colIndex)].newValue
        : result.rows[aIdx]?.[colIndex];

      const rawB = pendingEdits[cellEditKey(bIdx, colIndex)]
        ? pendingEdits[cellEditKey(bIdx, colIndex)].newValue
        : result.rows[bIdx]?.[colIndex];

      const nullA = isNullCell(rawA);
      const nullB = isNullCell(rawB);

      if (nullA && nullB) return 0;
      if (nullA) return 1;
      if (nullB) return -1;

      let comp = 0;

      if (typeof rawA === "number" && typeof rawB === "number") {
        comp = rawA - rawB;
      } else if (rawA instanceof Date && rawB instanceof Date) {
        comp = rawA.getTime() - rawB.getTime();
      } else {
        const numA = Number(rawA);
        const numB = Number(rawB);
        const strRawA = String(rawA ?? "").trim();
        const strRawB = String(rawB ?? "").trim();

        if (strRawA !== "" && strRawB !== "" && !isNaN(numA) && !isNaN(numB)) {
          comp = numA - numB;
        } else {
          const strA = formatCell(rawA).toLowerCase();
          const strB = formatCell(rawB).toLowerCase();
          comp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: "base" });
        }
      }

      return direction === "asc" ? comp : -comp;
    });
  }, [result.rows, pendingEdits, sortState]);

  const displayValue = (rowIndex: number, columnIndex: number, cell: unknown) => {
    const pending = pendingEdits[cellEditKey(rowIndex, columnIndex)];
    return pending ? pending.newValue : cell;
  };

  const computedAutoWidths = useMemo(() => {
    if (fitColumnsToContent) return {};
    return computeAutoColWidths(
      density,
      visibleColumns,
      result.rows,
      pendingEdits,
      fontScale,
    );
  }, [
    density,
    fitColumnsToContent,
    visibleColumns,
    result.rows,
    pendingEdits,
    fontScale,
  ]);

  const effectiveColWidths = useMemo(() => {
    const merged = { ...computedAutoWidths };
    for (const name of userResizedRef.current) {
      if (colWidths[name] != null) merged[name] = colWidths[name];
    }
    return merged;
  }, [computedAutoWidths, colWidths]);

  const hasColWidths = Object.keys(effectiveColWidths).length > 0;
  const tableWidth = useMemo(() => {
    if (!hasColWidths) return undefined;
    const dataWidth = visibleColumns.reduce(
      (sum, { col }) => sum + (effectiveColWidths[col.name] ?? 0),
      0,
    );
    return rowNumWidthRef.current + dataWidth;
  }, [hasColWidths, visibleColumns, effectiveColWidths]);

  const headerWrapRef = useRef<HTMLDivElement | null>(null);
  const bodyWrapRef = useRef<HTMLDivElement | null>(null);

  const handleBodyScroll = useCallback(() => {
    if (bodyWrapRef.current && headerWrapRef.current) {
      headerWrapRef.current.scrollLeft = bodyWrapRef.current.scrollLeft;
    }
  }, []);

  const colGroupMarkup = hasColWidths ? (
    <colgroup>
      <col className="col-row-num" style={{ width: rowNumWidthRef.current }} />
      {visibleColumns.map(({ col }) => (
        <col
          key={col.name}
          style={{ width: effectiveColWidths[col.name] ?? 1 }}
        />
      ))}
    </colgroup>
  ) : null;

  const tableClasses = [
    `results-grid density-${density}`,
    hasColWidths ? "has-col-widths" : "",
    fitColumnsToContent ? "fit-content" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tableStyle: React.CSSProperties = {
    ...(tableWidth != null ? { width: tableWidth } : {}),
  };

  return (
    <div className="grid-split-viewport">
      <div
        ref={headerWrapRef}
        className="grid-header-wrap"
        style={{ overflow: "hidden", overflowX: "hidden", overflowY: "hidden" }}
      >
        <table className={tableClasses} style={tableStyle}>
          {colGroupMarkup}
          <thead>
            <tr
              ref={headerRowRef}
              style={
                density === "crammed" && crammedHeight
                  ? { height: crammedHeight }
                  : undefined
              }
            >
              <th className="row-num">
                <span className="th-label">#</span>
              </th>
              {visibleColumns.map(({ col, index: colIndex }) => {
                const w = effectiveColWidths[col.name];
                const isSorted = sortState?.colIndex === colIndex;
                const sortDir = isSorted ? sortState.direction : null;

                return (
                  <th
                    key={`${col.name}`}
                    className={`grid-header-cell ${isSorted ? "sorted" : ""}`}
                    title={`Click to sort by ${col.name} ${
                      isSorted
                        ? sortDir === "asc"
                          ? "(▲ Ascending — click for Descending)"
                          : "(▼ Descending — click to reset)"
                        : "(click for Ascending)"
                    } · ${col.type}`}
                    style={
                      w
                        ? {
                            width: w,
                            minWidth: w,
                            maxWidth: w,
                          }
                        : undefined
                    }
                    onClick={(e) => {
                      if ((e.target as HTMLElement).classList.contains("col-resize")) return;
                      handleHeaderClick(colIndex, col.name);
                    }}
                  >
                    <span className="th-label">
                      {col.name}
                      {isSorted && (
                        <span className="sort-indicator" aria-hidden="true">
                          {sortDir === "asc" ? " ▲" : " ▼"}
                        </span>
                      )}
                    </span>
                    <span
                      className="col-resize"
                      title="Drag to resize · double-click to reset"
                      onPointerDown={(event) => onResizePointerDown(col.name, event)}
                      onPointerMove={onResizePointerMove}
                      onPointerUp={onResizePointerUp}
                      onPointerCancel={endResize}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        resetColumnWidth(col.name);
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>
      </div>
      <div ref={bodyWrapRef} className="grid-body-wrap" onScroll={handleBodyScroll}>
        <table ref={tableRef} className={tableClasses} style={tableStyle}>
          {colGroupMarkup}
          <tbody>
            {sortedRowIndices.map((rowIndex, displayIndex) => {
              const row = result.rows[rowIndex];
              return (
                <tr key={rowIndex}>
                  <td className="row-num">{displayIndex + 1}</td>
                {visibleColumns.map(({ col, index: columnIndex }) => {
                  const cell = displayValue(rowIndex, columnIndex, row[columnIndex]);
                  const text = formatCell(cell);
                  const nullCell = isNullCell(cell);
                  const dirty = !!pendingEdits[cellEditKey(rowIndex, columnIndex)];
                  const isEditing =
                    editing?.rowIndex === rowIndex && editing.columnIndex === columnIndex;
                  const customTitle = getCellTitle?.(
                    rowIndex,
                    columnIndex,
                    col.name,
                    cell,
                    text,
                  );
                  const title =
                    customTitle ??
                    (editable
                      ? `${text} — double-click to edit; empty or NULL clears`
                      : text);

                  const w = effectiveColWidths[col.name];

                  return (
                    <td
                      key={columnIndex}
                      title={title}
                      style={
                        w
                          ? {
                              width: w,
                              minWidth: w,
                              maxWidth: w,
                            }
                          : undefined
                      }
                      className={[
                        nullCell ? "cell-null" : "",
                        dirty ? "cell-dirty" : "",
                        editable ? "cell-editable" : "",
                        isEditing ? "cell-editing" : "",
                        customTitle ? "cell-has-def" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDoubleClick={() => beginEdit(rowIndex, columnIndex)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="cell-editor"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitEdit();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelEdit();
                            }
                          }}
                        />
                      ) : (
                        text
                      )}
                      <span
                        className="col-resize"
                        title="Drag to resize · double-click to reset"
                        onPointerDown={(event) => onResizePointerDown(col.name, event)}
                        onPointerMove={onResizePointerMove}
                        onPointerUp={onResizePointerUp}
                        onPointerCancel={endResize}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          resetColumnWidth(col.name);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

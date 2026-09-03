import React, { memo, useState, useEffect, useRef, useMemo } from "react";
import type { QueryResult } from "../types";
import {
  generateInsertStatements,
  generateInsertStatementsPreview,
  getExportableColumns,
} from "../sqlInsertExporter";

interface Props {
  result: QueryResult;
  initialTableName?: string;
  onClose: () => void;
  onExportSaved: (filePath: string, rowCount: number) => void;
  onCopySuccess: (rowCount: number) => void;
  onError: (error: string) => void;
}

function ExportInsertsModal({
  result,
  initialTableName = "MY_TABLE",
  onClose,
  onExportSaved,
  onCopySuccess,
  onError,
}: Props) {
  const [tableName, setTableName] = useState(initialTableName);
  const [includeColumns, setIncludeColumns] = useState(true);
  const [includeCommit, setIncludeCommit] = useState(true);
  const [batchCommit, setBatchCommit] = useState(result.rows.length > 500);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const backdropMouseDownRef = useRef(false);

  // Auto-focus and select input text on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const exportableCols = useMemo(
    () => getExportableColumns(result.columns),
    [result.columns],
  );

  const effectiveOptions = useMemo(
    () => ({
      tableName: tableName.trim() || "TARGET_TABLE",
      includeColumns,
      includeCommit,
      batchCommitSize: batchCommit ? 500 : 0,
    }),
    [tableName, includeColumns, includeCommit, batchCommit],
  );

  const previewSql = useMemo(() => {
    return generateInsertStatementsPreview(result, effectiveOptions, 3);
  }, [result, effectiveOptions]);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (backdropMouseDownRef.current && e.target === e.currentTarget) {
      onClose();
    }
    backdropMouseDownRef.current = false;
  };

  const handleCopyClipboard = async () => {
    const targetName = tableName.trim();
    if (!targetName) {
      inputRef.current?.focus();
      return;
    }

    try {
      const sqlContent = generateInsertStatements(result, effectiveOptions);
      await navigator.clipboard.writeText(sqlContent);
      setCopied(true);
      onCopySuccess(result.rows.length);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveToFile = async () => {
    const targetName = tableName.trim();
    if (!targetName) {
      inputRef.current?.focus();
      return;
    }

    setIsExporting(true);
    try {
      const sqlContent = generateInsertStatements(result, effectiveOptions);
      const sanitizedName = targetName
        .replace(/["']/g, "")
        .replace(/\./g, "_")
        .toLowerCase();
      const defaultFilename = `${sanitizedName || "export"}-inserts.sql`;

      if (window.oracle?.saveFile) {
        const saved = await window.oracle.saveFile(
          sqlContent,
          defaultFilename,
          "SQL Script",
          "sql",
        );
        if (saved.saved && saved.filePath) {
          onExportSaved(saved.filePath, result.rows.length);
          onClose();
        }
      } else {
        // Fallback for web / tests
        const blob = new Blob([sqlContent], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultFilename;
        a.click();
        URL.revokeObjectURL(url);
        onExportSaved(defaultFilename, result.rows.length);
        onClose();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveToFile();
  };

  const isTableEmpty = !tableName.trim();

  return (
    <div
      className="modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="modal export-inserts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="export-inserts-title"
      >
        <div className="modal-header">
          <h3 id="export-inserts-title">
            <span className="export-modal-icon">📝</span> Export SQL INSERTs
          </h3>
          <button
            type="button"
            className="icon-button close-btn"
            onClick={onClose}
            title="Cancel (Esc)"
          >
            ✕
          </button>
        </div>

        <p className="export-modal-description">
          Export <strong>{result.rows.length}</strong> row
          {result.rows.length === 1 ? "" : "s"} (
          <strong>{exportableCols.length}</strong> column
          {exportableCols.length === 1 ? "" : "s"}) as executable SQL INSERT
          statements.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="export-modal-body">
            <div className="modal-field-group">
              <label htmlFor="export-table-name">
                Target Table Name <span className="required-star">*</span>
              </label>
              <input
                id="export-table-name"
                ref={inputRef}
                type="text"
                className="input export-table-name-input"
                placeholder="e.g. EMPLOYEES or HR.EMPLOYEES"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field-hint">
                Table or view to insert into (supports <code>SCHEMA.TABLE</code>{" "}
                or quoted identifiers).
              </span>
            </div>

            <div className="export-options-group">
              <label className="checkbox-row" htmlFor="export-include-columns">
                <input
                  id="export-include-columns"
                  type="checkbox"
                  checked={includeColumns}
                  onChange={(e) => setIncludeColumns(e.target.checked)}
                />
                <span>Include column names (e.g. <code>INSERT INTO table (col1, col2) ...</code>)</span>
              </label>

              <label className="checkbox-row" htmlFor="export-include-commit">
                <input
                  id="export-include-commit"
                  type="checkbox"
                  checked={includeCommit}
                  onChange={(e) => setIncludeCommit(e.target.checked)}
                />
                <span>Add <code>COMMIT;</code> at end</span>
              </label>

              {result.rows.length > 500 && (
                <label className="checkbox-row" htmlFor="export-batch-commit">
                  <input
                    id="export-batch-commit"
                    type="checkbox"
                    checked={batchCommit}
                    disabled={!includeCommit}
                    onChange={(e) => setBatchCommit(e.target.checked)}
                  />
                  <span>Batch commit every 500 rows</span>
                </label>
              )}
            </div>

            <div className="export-preview-section">
              <div className="export-preview-header">
                <span>Live Preview:</span>
                <span className="preview-tag">
                  {Math.min(result.rows.length, 3)} of {result.rows.length} row
                  {result.rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <pre className="export-preview-code">{previewSql}</pre>
            </div>
          </div>

          <div className="modal-actions export-modal-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn secondary copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopyClipboard}
              disabled={isTableEmpty || isExporting}
              title="Copy SQL INSERT statements to clipboard"
            >
              {copied ? "✓ Copied to Clipboard!" : "📋 Copy to Clipboard"}
            </button>
            <button
              type="submit"
              className="btn primary glow"
              disabled={isTableEmpty || isExporting}
              title="Save SQL INSERT statements to a .sql file"
            >
              {isExporting ? "Exporting..." : "💾 Export to File..."}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(ExportInsertsModal);

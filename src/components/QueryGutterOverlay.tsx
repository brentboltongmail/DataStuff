import { Fragment, memo, useEffect, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { SqlStatementBlock } from "../sqlStatement";

interface Props {
  sqlBlocks: SqlStatementBlock[];
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  editorLineHeight: number;
  copiedBlockId: string | null;
  busy: boolean;
  isExecutingQuery: boolean;
  runningBlockId: string | null;
  connected: boolean;
  onCopyQueryBlock: (block: SqlStatementBlock) => void;
  onRunQueryBlock: (block: SqlStatementBlock) => void;
  onCancelQuery: () => void;
}

function QueryGutterOverlay({
  sqlBlocks,
  editor,
  editorLineHeight,
  copiedBlockId,
  busy,
  isExecutingQuery,
  runningBlockId,
  connected,
  onCopyQueryBlock,
  onRunQueryBlock,
  onCancelQuery,
}: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;

    let scrollRaf: number | null = null;
    const disposableScroll = editor.onDidScrollChange(() => {
      if (scrollRaf == null) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null;
          setTick((t) => t + 1);
        });
      }
    });

    let contentTimer: number | null = null;
    const disposableContent = editor.onDidChangeModelContent(() => {
      if (contentTimer != null) window.clearTimeout(contentTimer);
      contentTimer = window.setTimeout(() => {
        contentTimer = null;
        setTick((t) => t + 1);
      }, 150);
    });

    const handleResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", handleResize);

    return () => {
      disposableScroll.dispose();
      disposableContent.dispose();
      if (scrollRaf != null) cancelAnimationFrame(scrollRaf);
      if (contentTimer != null) window.clearTimeout(contentTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, [editor]);

  const layoutInfo = editor?.getLayoutInfo();
  const viewportHeight = layoutInfo?.height ?? 600;
  const currentScrollTop = editor ? editor.getScrollTop() : 0;

  return (
    <>
      <div className="query-copy-gutter" style={{ left: "0px" }}>
        {sqlBlocks.map((block, idx) => {
          let top =
            12 +
            (block.startLine - 1) * editorLineHeight -
            currentScrollTop;
          let height =
            (block.endLine - block.startLine + 1) * editorLineHeight;

          if (editor) {
            const model = editor.getModel();
            const maxLine = model ? model.getLineCount() : block.endLine;
            const startLineTop = editor.getTopForLineNumber(
              Math.min(block.startLine, maxLine),
            );
            let endLineBottom: number;
            if (block.endLine >= maxLine) {
              const lastLineTop = editor.getTopForLineNumber(maxLine);
              endLineBottom = lastLineTop + editorLineHeight;
            } else {
              endLineBottom = editor.getTopForLineNumber(
                block.endLine + 1,
              );
            }
            top = startLineTop - currentScrollTop;
            height = Math.max(editorLineHeight, endLineBottom - startLineTop);
          }

          const isCopied = copiedBlockId === block.id;
          const MIN_BAR_HEIGHT = 3 * editorLineHeight;
          const barHeight = Math.max(MIN_BAR_HEIGHT, height);

          if (top + barHeight < -50 || top > viewportHeight + 100)
            return null;

          const labelHeight = 56;
          const visibleStart = Math.max(top, 0);
          const visibleEnd = Math.min(
            top + barHeight,
            viewportHeight,
          );
          const visibleCenter = (visibleStart + visibleEnd) / 2;
          const idealTop = visibleCenter - top - labelHeight / 2;
          const labelTop = Math.max(
            2,
            Math.min(
              Math.max(2, barHeight - labelHeight - 2),
              idealTop,
            ),
          );

          const isThisRunning =
            busy &&
            isExecutingQuery &&
            (runningBlockId === block.id ||
              (runningBlockId === null && sqlBlocks.length === 1));
          const isOtherRunning =
            busy && isExecutingQuery && !isThisRunning;

          return (
            <Fragment key={block.id}>
              {/* 1. QUERY COPY BAR */}
              <button
                type="button"
                className={`query-copy-bar ${isCopied ? "copied" : ""}`}
                style={{
                  top: `${top}px`,
                  height: `${barHeight}px`,
                }}
                title={`Click to copy Query ${idx + 1} (Lines ${block.startLine}–${block.endLine})`}
                onClick={() => onCopyQueryBlock(block)}
              >
                <span
                  className="query-copy-label"
                  style={{
                    top: `${labelTop}px`,
                  }}
                >
                  {isCopied ? "✓ COPIED" : "COPY"}
                </span>
              </button>

              {/* 2. QUERY RUN / CANCEL BAR */}
              <button
                type="button"
                className={`query-run-bar ${
                  isThisRunning
                    ? "running"
                    : isOtherRunning
                      ? "disabled-running"
                      : ""
                }`}
                style={{
                  top: `${top}px`,
                  height: `${barHeight}px`,
                }}
                disabled={isOtherRunning || !connected}
                title={
                  isThisRunning
                    ? "Click to CANCEL running SQL query execution"
                    : isOtherRunning
                      ? "Another query is currently executing"
                      : !connected
                        ? "Connect to Oracle database first"
                        : `Click to RUN Query ${idx + 1} (Lines ${block.startLine}–${block.endLine})`
                }
                onClick={() => {
                  if (isThisRunning) {
                    void onCancelQuery();
                  } else if (!isOtherRunning && connected) {
                    void onRunQueryBlock(block);
                  }
                }}
              >
                <span
                  className="query-run-label"
                  style={{
                    top: `${labelTop}px`,
                  }}
                >
                  {isThisRunning ? "CANCEL" : "RUN"}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>

      {/* SPARKLES ALL OVER COPIED QUERY BLOCK WITH SLOW FADE AWAY */}
      {sqlBlocks.map((block) => {
        if (copiedBlockId !== block.id) return null;
        let top = (block.startLine - 1) * editorLineHeight - currentScrollTop;
        let height = (block.endLine - block.startLine + 1) * editorLineHeight;
        if (editor) {
          const model = editor.getModel();
          const maxLine = model ? model.getLineCount() : block.endLine;
          const startLineTop = editor.getTopForLineNumber(
            Math.min(block.startLine, maxLine),
          );
          let endLineBottom: number;
          if (block.endLine >= maxLine) {
            const lastLineTop = editor.getTopForLineNumber(maxLine);
            endLineBottom = lastLineTop + editorLineHeight;
          } else {
            endLineBottom = editor.getTopForLineNumber(block.endLine + 1);
          }
          top = startLineTop - currentScrollTop;
          height = Math.max(editorLineHeight, endLineBottom - startLineTop);
        }

        return (
          <div
            key={`copy-sparkles-${block.id}`}
            className="query-copied-sparkle-field"
            style={{
              top: `${top}px`,
              height: `${height}px`,
            }}
          >
            <div className="copy-glow-backdrop" />
            <span className="query-sparkle sp1" style={{ top: "15%", left: "10%" }} />
            <span className="query-sparkle sp2" style={{ top: "25%", left: "35%" }} />
            <span className="query-sparkle sp3" style={{ top: "10%", left: "65%" }} />
            <span className="query-sparkle sp4" style={{ top: "30%", left: "85%" }} />
            <span className="query-sparkle sp5" style={{ top: "50%", left: "20%" }} />
            <span className="query-sparkle sp6" style={{ top: "45%", left: "50%" }} />
            <span className="query-sparkle sp7" style={{ top: "60%", left: "78%" }} />
            <span className="query-sparkle sp8" style={{ top: "75%", left: "15%" }} />
            <span className="query-sparkle sp9" style={{ top: "80%", left: "42%" }} />
            <span className="query-sparkle sp10" style={{ top: "70%", left: "90%" }} />
            <span className="query-sparkle sp11" style={{ top: "35%", left: "5%" }} />
            <span className="query-sparkle sp12" style={{ top: "85%", left: "68%" }} />
            <span className="query-sparkle sp13" style={{ top: "20%", left: "48%" }} />
            <span className="query-sparkle sp14" style={{ top: "65%", left: "30%" }} />
            <span className="query-sparkle sp15" style={{ top: "90%", left: "25%" }} />
            <span className="query-sparkle sp16" style={{ top: "40%", left: "92%" }} />
          </div>
        );
      })}
      {copiedBlockId && <div className="query-copied-toast">✓ Query Copied!</div>}
    </>
  );
}

export default memo(QueryGutterOverlay);

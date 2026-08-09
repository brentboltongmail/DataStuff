import { useEffect, useRef, useState } from "react";
import type { SqlTab } from "../types";

interface Props {
  tabs: SqlTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onOpen: () => void;
  onRename: (id: string, title: string) => void;
  onSplitPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSplitPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSplitPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSplitPointerCancel?: () => void;
  onDoubleClickSplit?: () => void;
}

export default function SqlTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  onOpen,
  onRename,
  onSplitPointerDown,
  onSplitPointerMove,
  onSplitPointerUp,
  onSplitPointerCancel,
  onDoubleClickSplit,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const beginRename = (tab: SqlTab) => {
    setEditingId(tab.id);
    setDraft(tab.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    const next = draft.trim();
    const tab = tabs.find((entry) => entry.id === editingId);
    setEditingId(null);
    if (tab && next && next !== tab.title) {
      onRename(editingId, next);
    }
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  return (
    <div className="sql-tabs" role="tablist">
      <div className="sql-tab-actions">
        <button
          type="button"
          className="sql-tab-add"
          title="Open SQL file (Cmd+O)"
          onClick={onOpen}
        >
          Open
        </button>
        <button type="button" className="sql-tab-add" title="New tab (Cmd+T)" onClick={onAdd}>
          +
        </button>
      </div>
      <div className="sql-tabs-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`sql-tab ${tab.id === activeId ? "active" : ""}`}
            role="tab"
            aria-selected={tab.id === activeId}
            onClick={() => {
              if (editingId === tab.id) return;
              onSelect(tab.id);
            }}
            title={tab.fileName}
          >
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                className="sql-tab-rename"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="sql-tab-title"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(tab.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onSelect(tab.id);
                  beginRename(tab);
                }}
              >
                {tab.title}
              </button>
            )}
            <button
              type="button"
              className="sql-tab-close"
              title="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {onSplitPointerDown ? (
        <div
          className="sql-tabs-drag-handle"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to expand query editor section · double-click to maximize/reset"
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerCancel}
          onDoubleClick={onDoubleClickSplit}
        >
          <span className="sql-tabs-drag-grip">
            <span className="drag-icon">⇕</span>
            <span className="drag-text">Drag to Expand</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

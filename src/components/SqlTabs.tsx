import { useEffect, useRef, useState, type DragEvent } from "react";
import type { SqlTab } from "../types";

interface Props {
  tabs: SqlTab[];
  activeId: string;
  isBusy?: boolean;
  runningTabId?: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onOpen: () => void;
  onRename: (id: string, title: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  width?: number;
}

export default function SqlTabs({
  tabs,
  activeId,
  isBusy,
  runningTabId,
  onSelect,
  onClose,
  onAdd,
  onOpen,
  onRename,
  onReorder,
  width,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
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

  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (editingId !== null) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex && onReorder) {
      onReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const dynamicStyle = width
    ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }
    : undefined;

  return (
    <div className="sql-tabs" role="tablist" style={dynamicStyle}>
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
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          const isRunning =
            !!isBusy && (runningTabId ? tab.id === runningTabId : tab.id === activeId);
          const isEditing = editingId === tab.id;
          const isDragging = draggedIndex === index;
          const isDropTarget = dragOverIndex === index && draggedIndex !== index;

          return (
            <div
              key={tab.id}
              className={`sql-tab ${isActive ? "active" : ""} ${isRunning ? "is-running" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
              role="tab"
              aria-selected={isActive}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => {
                if (isEditing) return;
                onSelect(tab.id);
              }}
              title={
                isRunning
                  ? `${tab.fileName} (Query running...)`
                  : `${tab.fileName} (click & drag to reorder)`
              }
            >
              {isEditing ? (
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
                  {isRunning && (
                    <span className="sql-tab-running-indicator" title="Query execution in progress...">
                      <span className="sql-tab-running-spinner" />
                      <span className="sql-tab-running-icon">⚡</span>
                    </span>
                  )}
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
          );
        })}
      </div>
    </div>
  );
}

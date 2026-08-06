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
}

export default function SqlTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  onOpen,
  onRename,
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
  );
}

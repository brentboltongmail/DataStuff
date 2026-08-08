import React, { useState, useEffect } from "react";
import type { BindType, BindVarParam } from "../bindVariables";

interface Props {
  varNames: string[];
  initialValues: Record<string, BindVarParam>;
  onConfirm: (values: Record<string, BindVarParam>) => void;
  onCancel: () => void;
}

export default function BindVariablesModal({
  varNames,
  initialValues,
  onConfirm,
  onCancel,
}: Props) {
  const [params, setParams] = useState<Record<string, BindVarParam>>(() => {
    const map: Record<string, BindVarParam> = {};
    for (const name of varNames) {
      if (initialValues[name]) {
        map[name] = { ...initialValues[name] };
      } else {
        map[name] = { name, type: "VARCHAR2", value: "" };
      }
    }
    return map;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(params);
  };

  const updateType = (name: string, type: BindType) => {
    setParams((prev) => ({
      ...prev,
      [name]: { ...prev[name], type },
    }));
  };

  const updateValue = (name: string, value: string) => {
    setParams((prev) => ({
      ...prev,
      [name]: { ...prev[name], value },
    }));
  };

  const backdropMouseDownRef = React.useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (backdropMouseDownRef.current && e.target === e.currentTarget) {
      onCancel();
    }
    backdropMouseDownRef.current = false;
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="modal bind-variables-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <span className="bind-modal-icon">⚡</span> Enter Bind Variables
          </h3>
          <button className="icon-button close-btn" onClick={onCancel} title="Cancel">
            ✕
          </button>
        </div>

        <p className="bind-modal-description">
          This query contains <strong>{varNames.length}</strong> bind variable
          {varNames.length === 1 ? "" : "s"}. Specify data types and values:
        </p>

        <form onSubmit={handleSubmit}>
          <div className="bind-params-list">
            {varNames.map((name, index) => {
              const current = params[name] ?? { name, type: "VARCHAR2", value: "" };
              return (
                <div key={name} className="bind-param-row">
                  <div className="bind-param-label">
                    <span className="bind-colon">:</span>
                    <span className="bind-name">{name}</span>
                  </div>

                  <div className="bind-param-inputs">
                    <select
                      className="bind-type-select"
                      value={current.type}
                      onChange={(e) => updateType(name, e.target.value as BindType)}
                    >
                      <option value="VARCHAR2">VARCHAR2 (String)</option>
                      <option value="NUMBER">NUMBER</option>
                      <option value="DATE">DATE (YYYY-MM-DD)</option>
                      <option value="TIMESTAMP">TIMESTAMP</option>
                      <option value="NULL">NULL</option>
                    </select>

                    <input
                      type="text"
                      className="bind-value-input"
                      placeholder={current.type === "NULL" ? "NULL value" : `Value for :${name}`}
                      disabled={current.type === "NULL"}
                      value={current.type === "NULL" ? "" : current.value}
                      autoFocus={index === 0}
                      onChange={(e) => updateValue(name, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn primary glow">
              Run Query
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

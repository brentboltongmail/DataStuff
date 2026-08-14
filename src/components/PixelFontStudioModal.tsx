import React, { useState, useEffect, useCallback, useMemo } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."!@#$%^&*()_+-=[]{}|;:'\",.<>/?\\`~",
];

// Initial 8x8 bitmap template for A-Z, 0-9
const DEFAULT_TEMPLATES: Record<string, string[]> = {
  A: ["  ████  ", " ██  ██ ", " ██  ██ ", " ██████ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "        "],
  B: [" █████  ", " ██  ██ ", " ██  ██ ", " █████  ", " ██  ██ ", " ██  ██ ", " █████  ", "        "],
  C: ["  █████ ", " ██  ██ ", " ██     ", " ██     ", " ██     ", " ██  ██ ", "  █████ ", "        "],
  D: [" █████  ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " █████  ", "        "],
  E: [" ██████ ", " ██     ", " ██     ", " █████  ", " ██     ", " ██     ", " ██████ ", "        "],
  F: [" ██████ ", " ██     ", " ██     ", " █████  ", " ██     ", " ██     ", " ██     ", "        "],
  G: ["  █████ ", " ██  ██ ", " ██     ", " ██ ███ ", " ██  ██ ", " ██  ██ ", "  █████ ", "        "],
  H: [" ██  ██ ", " ██  ██ ", " ██  ██ ", " ██████ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "        "],
  I: [" ██████ ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", " ██████ ", "        "],
  J: ["  █████ ", "    ██  ", "    ██  ", "    ██  ", "    ██  ", " ██ ██  ", "  ███   ", "        "],
  K: [" ██  ██ ", " ██ ██  ", " ████   ", " ███    ", " ████   ", " ██ ██  ", " ██  ██ ", "        "],
  L: [" ██     ", " ██     ", " ██     ", " ██     ", " ██     ", " ██     ", " ██████ ", "        "],
  M: [" ██  ██ ", " ██████ ", " ██████ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "        "],
  N: [" ██  ██ ", " ███ ██ ", " ██████ ", " ██████ ", " ██ ███ ", " ██  ██ ", " ██  ██ ", "        "],
  O: ["  ████  ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "  ████  ", "        "],
  P: [" █████  ", " ██  ██ ", " ██  ██ ", " █████  ", " ██     ", " ██     ", " ██     ", "        "],
  Q: ["  ████  ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██ ██  ", " ██  ██ ", "  █████ ", "        "],
  R: [" █████  ", " ██  ██ ", " ██  ██ ", " █████  ", " ████   ", " ██ ██  ", " ██  ██ ", "        "],
  S: ["  █████ ", " ██  ██ ", " ██     ", "  ████  ", "     ██ ", " ██  ██ ", "  ████  ", "        "],
  T: [" ██████ ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "        "],
  U: [" ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "  ████  ", "        "],
  V: [" ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", "  ████  ", "   ██   ", "        "],
  W: [" ██  ██ ", " ██  ██ ", " ██  ██ ", " ██  ██ ", " ██████ ", " ██████ ", " ██  ██ ", "        "],
  X: [" ██  ██ ", " ██  ██ ", "  ████  ", "   ██   ", "  ████  ", " ██  ██ ", " ██  ██ ", "        "],
  Y: [" ██  ██ ", " ██  ██ ", "  ████  ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", "        "],
  Z: [" ██████ ", "     ██ ", "    ██  ", "   ██   ", "  ██    ", " ██     ", " ██████ ", "        "],
  "0": ["  ████  ", " ██  ██ ", " ██ █ ██", " ██ █ ██", " ██ █ ██", " ██  ██ ", "  ████  ", "        "],
  "1": ["   ██   ", "  ███   ", "   ██   ", "   ██   ", "   ██   ", "   ██   ", " ██████ ", "        "],
  "2": ["  ████  ", " ██  ██ ", "     ██ ", "   ███  ", "  ██    ", " ██     ", " ██████ ", "        "],
  "3": ["  ████  ", " ██  ██ ", "     ██ ", "   ███  ", "     ██ ", " ██  ██ ", "  ████  ", "        "],
  "4": ["   ███  ", "  ████  ", " ██ ██  ", " ██ ██  ", " ██████ ", "    ██  ", "    ██  ", "        "],
  "5": [" ██████ ", " ██     ", " █████  ", "     ██ ", "     ██ ", " ██  ██ ", "  ████  ", "        "],
  "6": ["  ████  ", " ██  ██ ", " ██     ", " █████  ", " ██  ██ ", " ██  ██ ", "  ████  ", "        "],
  "7": [" ██████ ", "     ██ ", "    ██  ", "   ██   ", "  ██    ", "  ██    ", "  ██    ", "        "],
  "8": ["  ████  ", " ██  ██ ", " ██  ██ ", "  ████  ", " ██  ██ ", " ██  ██ ", "  ████  ", "        "],
  "9": ["  ████  ", " ██  ██ ", " ██  ██ ", "  █████ ", "     ██ ", " ██  ██ ", "  ████  ", "        "],
};

export default function PixelFontStudioModal({ isOpen, onClose }: Props) {
  const [fontName, setFontName] = useState("MyPixelFont");
  const [selectedChar, setSelectedChar] = useState("A");
  const [gridWidth, setGridWidth] = useState(8);
  const [gridHeight, setGridHeight] = useState(8);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [paintMode, setPaintMode] = useState<boolean | null>(null);
  const [previewText, setPreviewText] = useState("SELECT * FROM USERS;");
  const [exportMessage, setExportMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Store boolean grid for each character based on gridWidth x gridHeight
  const [fontMap, setFontMap] = useState<Record<string, boolean[][]>>(() => {
    const initial: Record<string, boolean[][]> = {};
    for (const char of DEFAULT_CHARS) {
      const tpl = DEFAULT_TEMPLATES[char] || DEFAULT_TEMPLATES[char.toUpperCase()] || Array(8).fill("        ");
      initial[char] = tpl.map((row) => row.split("").map((c) => c !== " "));
    }
    return initial;
  });

  // Handle dynamic grid dimension changes
  const handleResizeGrid = useCallback((newW: number, newH: number) => {
    const clampedW = Math.max(4, Math.min(32, newW));
    const clampedH = Math.max(4, Math.min(32, newH));
    setGridWidth(clampedW);
    setGridHeight(clampedH);

    setFontMap((prev) => {
      const nextMap: Record<string, boolean[][]> = {};
      for (const char of DEFAULT_CHARS) {
        const oldGrid = prev[char] || [];
        const newGrid: boolean[][] = Array(clampedH)
          .fill(null)
          .map((_, r) =>
            Array(clampedW)
              .fill(null)
              .map((_, c) => (oldGrid[r] && oldGrid[r][c] ? true : false)),
          );
        nextMap[char] = newGrid;
      }
      return nextMap;
    });
  }, []);

  const currentGrid = useMemo(() => {
    return fontMap[selectedChar] || Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false));
  }, [fontMap, selectedChar, gridHeight, gridWidth]);

  const togglePixel = useCallback(
    (row: number, col: number, forceState?: boolean) => {
      setFontMap((prev) => {
        const charGrid = prev[selectedChar]
          ? prev[selectedChar].map((r) => [...r])
          : Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false));
        const nextVal = forceState !== undefined ? forceState : !charGrid[row]?.[col];
        if (charGrid[row]) {
          charGrid[row][col] = nextVal;
        }
        return { ...prev, [selectedChar]: charGrid };
      });
    },
    [selectedChar, gridHeight, gridWidth],
  );

  const handleCellMouseDown = (row: number, col: number) => {
    const nextState = !currentGrid[row]?.[col];
    setPaintMode(nextState);
    setIsMouseDown(true);
    togglePixel(row, col, nextState);
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isMouseDown && paintMode !== null) {
      togglePixel(row, col, paintMode);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseDown(false);
      setPaintMode(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const clearCurrentChar = () => {
    setFontMap((prev) => ({
      ...prev,
      [selectedChar]: Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false)),
    }));
  };

  const invertCurrentChar = () => {
    setFontMap((prev) => ({
      ...prev,
      [selectedChar]: currentGrid.map((row) => row.map((cell) => !cell)),
    }));
  };

  const copyUpperToLower = () => {
    setFontMap((prev) => {
      const next = { ...prev };
      for (const char of "abcdefghijklmnopqrstuvwxyz") {
        const upper = char.toUpperCase();
        if (next[upper]) {
          next[char] = next[upper].map((r) => [...r]);
        }
      }
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage("Building TrueType Font (.ttf)...");
    try {
      const stringMap: Record<string, string[]> = {};
      for (const [char, grid] of Object.entries(fontMap)) {
        stringMap[char] = grid.map((row) => row.map((cell) => (cell ? "██" : "  ")).join(""));
      }

      if (window.oracle?.generateFont) {
        const res = await window.oracle.generateFont(fontName, stringMap, gridWidth, gridHeight);
        setExportMessage(`✨ Successfully created ${res.path}! Double click to install on Mac.`);
      } else {
        setExportMessage("Font export ready! Connect IPC to save file.");
      }
    } catch (err) {
      setExportMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate dynamic canvas cell size (px) so grid fits perfectly
  const cellSize = useMemo(() => {
    return Math.max(12, Math.min(36, Math.floor(280 / Math.max(gridWidth, gridHeight))));
  }, [gridWidth, gridHeight]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100000 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 960,
          maxWidth: "96vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          background: "var(--bg-panel, #1e2229)",
          border: "1px solid var(--border, #384152)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          color: "var(--text, #ffffff)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: "var(--accent, #3d8bfd)" }}>
              🎨 Pixel Font Studio
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted, #b8c4d6)" }}>
              Draw your font, dynamically resize the grid, preview live, and export a real `.ttf` file!
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            style={{ padding: "6px 14px", borderRadius: 8 }}
          >
            ✕ Close
          </button>
        </div>

        {/* Top Controls: Font Name + Dynamic Grid Resizer */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Font Name:</label>
            <input
              type="text"
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
              style={{
                padding: "6px 12px",
                background: "var(--input-bg, #15181e)",
                border: "1px solid var(--border, #384152)",
                borderRadius: 6,
                color: "#fff",
                fontSize: 14,
                width: 170,
              }}
            />
          </div>

          {/* Dynamic Grid Resizer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-elevated, #22262e)",
              padding: "4px 10px",
              borderRadius: 8,
              border: "1px solid var(--border, #384152)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#38bdf8" }}>
              📐 Grid Size:
            </span>
            <select
              value={`${gridWidth}x${gridHeight}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                if (w && h) handleResizeGrid(w, h);
              }}
              style={{
                background: "var(--input-bg, #15181e)",
                color: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 12,
              }}
            >
              <option value="8x8">8 × 8 (Standard)</option>
              <option value="8x10">8 × 10 (Tall Mono)</option>
              <option value="8x12">8 × 12 (IDE Code)</option>
              <option value="10x10">10 × 10 (Medium Square)</option>
              <option value="12x12">12 × 12 (HD Pixel)</option>
              <option value="16x16">16 × 16 (Ultra HD Grid)</option>
              <option value="6x8">6 × 8 (Compact Mini)</option>
            </select>

            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Custom:</span>
            <input
              type="number"
              min={4}
              max={32}
              value={gridWidth}
              onChange={(e) => handleResizeGrid(Number(e.target.value), gridHeight)}
              style={{
                width: 44,
                padding: "2px 4px",
                background: "var(--input-bg, #15181e)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "#fff",
                fontSize: 12,
                textAlign: "center",
              }}
            />
            <span style={{ fontSize: 12 }}>×</span>
            <input
              type="number"
              min={4}
              max={32}
              value={gridHeight}
              onChange={(e) => handleResizeGrid(gridWidth, Number(e.target.value))}
              style={{
                width: 44,
                padding: "2px 4px",
                background: "var(--input-bg, #15181e)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "#fff",
                fontSize: 12,
                textAlign: "center",
              }}
            />
          </div>

          <button type="button" className="secondary" onClick={copyUpperToLower} style={{ fontSize: 12 }}>
            Copy A-Z to a-z
          </button>
        </div>

        {/* Main Workspace Grid & Character Selector */}
        <div style={{ display: "flex", gap: 24, minHeight: 330 }}>
          {/* Left Column: Interactive Resizable Pixel Canvas */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f472b6" }}>
              Editing Glyph: <span style={{ color: "#fff", fontSize: 22 }}>'{selectedChar}'</span>{" "}
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>
                ({gridWidth} × {gridHeight} px)
              </span>
            </div>

            {/* Dynamic Interactive Grid Canvas */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${gridWidth}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${gridHeight}, ${cellSize}px)`,
                gap: 2,
                background: "#0d0f12",
                padding: 6,
                borderRadius: 12,
                border: "2px solid var(--border, #384152)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                userSelect: "none",
              }}
            >
              {currentGrid.map((row, rIdx) =>
                row.map((active, cIdx) => (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    onMouseDown={() => handleCellMouseDown(rIdx, cIdx)}
                    onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: Math.max(2, Math.floor(cellSize / 8)),
                      background: active ? "var(--accent, #3d8bfd)" : "#1a1d23",
                      boxShadow: active ? "0 0 8px rgba(61, 139, 253, 0.8)" : "none",
                      border: "1px solid rgba(255,255,255,0.05)",
                      cursor: "pointer",
                      transition: "background 0.04s ease",
                    }}
                  />
                ))
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="secondary" onClick={clearCurrentChar} style={{ fontSize: 12 }}>
                Clear Grid
              </button>
              <button type="button" className="secondary" onClick={invertCurrentChar} style={{ fontSize: 12 }}>
                Invert
              </button>
            </div>
          </div>

          {/* Right Column: Character Picker Palette */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Character Selector:
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxHeight: 300,
                overflowY: "auto",
                padding: 8,
                background: "var(--input-bg, #15181e)",
                borderRadius: 10,
                border: "1px solid var(--border, #384152)",
              }}
            >
              {DEFAULT_CHARS.map((char) => {
                const isSel = char === selectedChar;
                const charGrid = fontMap[char];
                const hasPixels = charGrid ? charGrid.some((r) => r.some((c) => c)) : false;

                return (
                  <button
                    key={char}
                    type="button"
                    onClick={() => setSelectedChar(char)}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 6,
                      background: isSel ? "var(--accent, #3d8bfd)" : hasPixels ? "#22262e" : "#181b20",
                      color: isSel ? "#fff" : hasPixels ? "#cbd5e1" : "#64748b",
                      border: isSel ? "2px solid #ffffff" : "1px solid var(--border, #384152)",
                      fontWeight: isSel ? 700 : 500,
                      fontSize: 16,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.1s ease",
                    }}
                  >
                    {char}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Font Text Sandbox Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#3dd68c" }}>
              Live Font Sandbox Preview ({gridWidth} × {gridHeight} Grid):
            </span>
          </div>
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Type sample text..."
            style={{
              padding: "8px 12px",
              background: "var(--input-bg, #15181e)",
              border: "1px solid var(--border, #384152)",
              borderRadius: 6,
              color: "#fff",
              fontSize: 14,
            }}
          />

          {/* Render pixel font preview using SVG blocks with dynamic viewBox */}
          <div
            style={{
              padding: "16px",
              background: "#090b0e",
              borderRadius: 10,
              border: "1px solid var(--border, #384152)",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              minHeight: 60,
              alignItems: "center",
              overflowX: "auto",
            }}
          >
            {previewText.split("").map((ch, idx) => {
              const grid =
                fontMap[ch] ||
                fontMap[ch.toUpperCase()] ||
                Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false));
              return (
                <svg
                  key={`${ch}-${idx}`}
                  width={gridWidth * 3}
                  height={gridHeight * 3}
                  viewBox={`0 0 ${gridWidth} ${gridHeight}`}
                  style={{ display: "block" }}
                >
                  {grid.map((r, rIdx) =>
                    r.map((active, cIdx) =>
                      active ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx}
                          y={rIdx}
                          width="1"
                          height="1"
                          fill="#3dd68c"
                        />
                      ) : null,
                    ),
                  )}
                </svg>
              );
            })}
          </div>
        </div>

        {/* Footer Export Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 13, color: exportMessage.startsWith("✨") ? "#3dd68c" : "#e35d6a" }}>
            {exportMessage}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleExport}
              disabled={isExporting}
              style={{
                padding: "8px 20px",
                background: "var(--accent, #3d8bfd)",
                color: "#fff",
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              {isExporting ? "Generating TTF..." : `Export ${gridWidth}×${gridHeight} TTF Font`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [paintMode, setPaintMode] = useState<boolean | null>(null); // true = fill, false = erase
  const [previewText, setPreviewText] = useState("SELECT * FROM USERS;");
  const [exportMessage, setExportMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Store 8x8 boolean grid for each character
  const [fontMap, setFontMap] = useState<Record<string, boolean[][]>>(() => {
    const initial: Record<string, boolean[][]> = {};
    for (const char of DEFAULT_CHARS) {
      const tpl = DEFAULT_TEMPLATES[char] || DEFAULT_TEMPLATES[char.toUpperCase()] || Array(8).fill("        ");
      initial[char] = tpl.map((row) => row.split("").map((c) => c !== " "));
    }
    return initial;
  });

  const currentGrid = useMemo(() => {
    return fontMap[selectedChar] || Array(8).fill(null).map(() => Array(8).fill(false));
  }, [fontMap, selectedChar]);

  const togglePixel = useCallback((row: number, col: number, forceState?: boolean) => {
    setFontMap((prev) => {
      const charGrid = prev[selectedChar] ? prev[selectedChar].map((r) => [...r]) : Array(8).fill(null).map(() => Array(8).fill(false));
      const nextVal = forceState !== undefined ? forceState : !charGrid[row][col];
      charGrid[row][col] = nextVal;
      return { ...prev, [selectedChar]: charGrid };
    });
  }, [selectedChar]);

  const handleCellMouseDown = (row: number, col: number) => {
    const nextState = !currentGrid[row][col];
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
      [selectedChar]: Array(8).fill(null).map(() => Array(8).fill(false)),
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
      // Convert boolean grid map to string map for python script
      const stringMap: Record<string, string[]> = {};
      for (const [char, grid] of Object.entries(fontMap)) {
        stringMap[char] = grid.map((row) => row.map((cell) => (cell ? "██" : "  ")).join(""));
      }

      if (window.oracle?.generateFont) {
        const res = await window.oracle.generateFont(fontName, stringMap);
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

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100000 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 900,
          maxWidth: "94vw",
          maxHeight: "90vh",
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
              Click or drag to draw pixels for each letter, preview live, and export your `.ttf` font file!
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

        {/* Top Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              width: 200,
            }}
          />
          <button type="button" className="secondary" onClick={copyUpperToLower} style={{ fontSize: 12 }}>
            Copy A-Z to a-z
          </button>
        </div>

        {/* Main Workspace Grid & Character Selector */}
        <div style={{ display: "flex", gap: 24, minHeight: 320 }}>
          {/* Left Column: Interactive Pixel Canvas */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f472b6" }}>
              Editing Glyph: <span style={{ color: "#fff", fontSize: 22 }}>'{selectedChar}'</span>
            </div>

            {/* 8x8 Interactive Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 34px)",
                gridTemplateRows: "repeat(8, 34px)",
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
                      width: 34,
                      height: 34,
                      borderRadius: 4,
                      background: active ? "var(--accent, #3d8bfd)" : "#1a1d23",
                      boxShadow: active ? "0 0 10px rgba(61, 139, 253, 0.8)" : "none",
                      border: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      transition: "background 0.05s ease",
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
                maxHeight: 280,
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
              Live Font Sandbox Preview:
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

          {/* Render pixel font preview using SVG blocks */}
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
              const grid = fontMap[ch] || fontMap[ch.toUpperCase()] || Array(8).fill(null).map(() => Array(8).fill(false));
              return (
                <svg key={`${ch}-${idx}`} width="20" height="20" viewBox="0 0 8 8" style={{ display: "block" }}>
                  {grid.map((r, rIdx) =>
                    r.map((active, cIdx) =>
                      active ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#3dd68c" /> : null
                    )
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
              {isExporting ? "Generating TTF..." : "Export TrueType Font (.ttf)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

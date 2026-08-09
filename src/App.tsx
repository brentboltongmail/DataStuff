import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import HistoryPanel from "./components/HistoryPanel";
import ObjectBrowser from "./components/ObjectBrowser";
import ResultsGrid, {
  cellEditKey,
  type CellEdit,
} from "./components/ResultsGrid";
import SqlTabs from "./components/SqlTabs";
import BindVariablesModal from "./components/BindVariablesModal";
import {
  parseBindVariables,
  prepareSqlWithBinds,
  type BindVarParam,
} from "./bindVariables";
import { formatCell, isNullCell, resultToCsv } from "./csv";
import {
  buildUpdate,
  detectSingleSourceTable,
  hasRowIdColumn,
  injectRowId,
  isRowIdColumn,
} from "./editableQuery";
import { formatElapsed } from "./formatElapsed";
import { formatSql } from "./sqlFormatter";
import {
  parseSqlStatements,
  statementBlockAtCursor,
  type SqlStatementBlock,
} from "./sqlStatement";
import {
  APP_THEMES,
  THEME_KEY,
  applyThemeToDocument,
  loadTheme,
  themeOption,
  type AppThemeId,
} from "./themes";
import { generateSeededPlanets } from "./planetGenerator";
import type {
  ConnectionConfig,
  ConnectionState,
  EditMeta,
  HistoryEntry,
  QueryResult,
  SqlTab,
  TabState,
} from "./types";

function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (isNullCell(a) && isNullCell(b)) return true;
  return formatCell(a) === formatCell(b);
}

function visibleColumnCount(result: QueryResult): number {
  return result.columns.filter((col) => !isRowIdColumn(col.name)).length;
}

function resultWithoutRowId(result: QueryResult): QueryResult {
  const keep = result.columns
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => !isRowIdColumn(col.name));
  return {
    ...result,
    columns: keep.map(({ col }) => col),
    rows: result.rows.map((row) => keep.map(({ index }) => row[index])),
  };
}

const EMPTY_CONNECTION: ConnectionConfig = {
  user: "",
  password: "",
  host: "localhost",
  port: "1521",
  service: "ORCLPDB1",
  tcps: false,
};

const HISTORY_KEY = "oracle-ide.history";
const MAX_ROWS_KEY = "oracle-ide.maxRows";
const DENSITY_KEY = "oracle-ide.gridDensity";
const FONT_SCALE_KEY = "oracle-ide.fontScale";
const EDITOR_SPLIT_KEY = "oracle-ide.editorSplit";
const SIDEBAR_WIDTH_KEY = "oracle-ide.sidebarWidth";
const SIDEBAR_COLLAPSED_KEY = "oracle-ide.sidebarCollapsed";
const QUERY_TABS_WIDTH_KEY = "oracle-ide.queryTabsWidth";
const REMEMBER_PASSWORD_KEY = "oracle-ide.rememberPassword";

const loadSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};

const DEFAULT_QUERY_TABS_WIDTH = 130;
const MIN_QUERY_TABS_WIDTH = 80;
const MAX_QUERY_TABS_WIDTH = 380;

const loadQueryTabsWidth = (): number => {
  try {
    const raw = localStorage.getItem(QUERY_TABS_WIDTH_KEY);
    const val = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(val) && val >= MIN_QUERY_TABS_WIDTH ? val : DEFAULT_QUERY_TABS_WIDTH;
  } catch {
    return DEFAULT_QUERY_TABS_WIDTH;
  }
};
const MAX_HISTORY = 100;
const DEFAULT_MAX_ROWS = 1000;
const DEFAULT_FONT_SCALE = 1;
const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 2.0;
const FONT_SCALE_STEP = 0.05;
const EDITOR_BASE_FONT_SIZE = 10;
const SAVE_DEBOUNCE_MS = 5_000;
const PASSWORD_SAVE_DEBOUNCE_MS = 400;
const DEFAULT_EDITOR_SPLIT = 0.42;
const MIN_EDITOR_SPLIT = 0.18;
const MAX_EDITOR_SPLIT = 0.82;
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 120;
const MAX_SIDEBAR_WIDTH = 600;
/** Fixed workspace chrome above/below the editor↔results split (tabs + splitter + toolbar). */
const WORKSPACE_FIXED_CHROME_PX = 2 + 20;
/** How often to probe a live Oracle session while connected. */
const CONNECTION_HEARTBEAT_MS = 30_000;

type GridDensity = "normal" | "compact" | "crammed";

const DENSITY_ORDER: GridDensity[] = ["normal", "compact", "crammed"];

function loadDensity(): GridDensity {
  const raw = localStorage.getItem(DENSITY_KEY);
  if (raw === "compact" || raw === "crammed" || raw === "normal") return raw;
  return "normal";
}

function nextDensity(current: GridDensity): GridDensity {
  const index = DENSITY_ORDER.indexOf(current);
  return DENSITY_ORDER[(index + 1) % DENSITY_ORDER.length];
}

function densityLabel(density: GridDensity): string {
  switch (density) {
    case "compact":
      return "Compact";
    case "crammed":
      return "Crammed";
    default:
      return "Normal";
  }
}

function formatLiveElapsedTime(ms: number): string {
  const totalSecs = ms / 1000;
  if (totalSecs < 60) {
    return `${totalSecs.toFixed(1)}s`;
  }
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(1);
  return `${mins}m ${secs.padStart(4, "0")}s`;
}

interface SolarFlareState {
  id: number;
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  maxScale: number;
}

const SolarAtmosphere: React.FC = () => {
  const [flares, setFlares] = useState<SolarFlareState[]>(() =>
    Array.from({ length: 5 }).map((_, i) => ({
      id: i,
      left: Math.floor(Math.random() * 85) + 5,
      top: Math.floor(Math.random() * 85) + 5,
      size: Math.floor(Math.random() * 80) + 40,
      duration: (Math.floor(Math.random() * 5) + 7) * 6, // 42s to 72s
      delay: i * 10.8,
      maxScale: Math.floor(Math.random() * 20) + 30,
    }))
  );

  const handleIteration = (id: number) => {
    setFlares((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              left: Math.floor(Math.random() * 90) + 5,
              top: Math.floor(Math.random() * 90) + 5,
              duration: (Math.floor(Math.random() * 5) + 7) * 6,
              maxScale: Math.floor(Math.random() * 20) + 30,
            }
          : f
      )
    );
  };

  return (
    <div className="solar-atmosphere">
      {flares.map((f) => (
        <div
          key={f.id}
          className="solar-flare-expanding"
          style={{
            left: `${f.left}%`,
            top: `${f.top}%`,
            width: `${f.size}px`,
            height: `${f.size}px`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            ["--max-scale" as string]: f.maxScale,
          }}
          onAnimationIteration={() => handleIteration(f.id)}
        />
      ))}
    </div>
  );
};

const CrystalAtmosphere: React.FC = () => {
  return (
    <div className="crystal-atmosphere">
      <div className="cavern-ambient-glow" />
      <div className="cavern-ceiling-arch">
        <div className="crystal-cluster cluster-top-left amethyst">
          <div className="gem-spike spike-1" />
          <div className="gem-spike spike-2" />
          <div className="gem-spike spike-3" />
        </div>
        <div className="crystal-cluster cluster-top-right rose-quartz">
          <div className="gem-spike spike-1" />
          <div className="gem-spike spike-2" />
          <div className="gem-spike spike-3" />
        </div>
      </div>
      <div className="cavern-floor-arch">
        <div className="crystal-cluster cluster-bottom-left emerald">
          <div className="gem-spike spike-1" />
          <div className="gem-spike spike-2" />
          <div className="gem-spike spike-3" />
          <div className="gem-spike spike-4" />
        </div>
        <div className="crystal-cluster cluster-bottom-right sapphire">
          <div className="gem-spike spike-1" />
          <div className="gem-spike spike-2" />
          <div className="gem-spike spike-3" />
        </div>
        <div className="crystal-cluster cluster-bottom-center topaz">
          <div className="gem-spike spike-1" />
          <div className="gem-spike spike-2" />
        </div>
      </div>
      <div className="floating-geode geode-1 amethyst" />
      <div className="floating-geode geode-2 rose-quartz" />
      <div className="floating-geode geode-3 emerald" />
      <div className="floating-geode geode-4 sapphire" />
      <div className="floating-geode geode-5 topaz" />
      <div className="prismatic-beam beam-1" />
      <div className="prismatic-beam beam-2" />
      <div className="crystal-dust dust-1" />
      <div className="crystal-dust dust-2" />
      <div className="crystal-dust dust-3" />
      <div className="crystal-dust dust-4" />
      <div className="crystal-dust dust-5" />
      <div className="crystal-dust dust-6" />
    </div>
  );
};

const DuneAtmosphere: React.FC = () => {
  return (
    <div className="dune-atmosphere">
      <div className="dune-sun-halo sun-primary" />
      <div className="dune-sun-halo sun-secondary" />
      <div className="dune-heat-haze" />
      <div className="dune-horizon dune-back" />
      <div className="dune-horizon dune-mid" />
      <div className="dune-horizon dune-front" />
      <div className="sand-sweep sweep-1" />
      <div className="sand-sweep sweep-2" />
      <div className="spice-mote mote-1" />
      <div className="spice-mote mote-2" />
      <div className="spice-mote mote-3" />
      <div className="spice-mote mote-4" />
      <div className="spice-mote mote-5" />
      <div className="spice-mote mote-6" />
      <div className="spice-mote mote-7" />
      <div className="spice-mote mote-8" />
      <div className="spice-mote mote-9" />
      <div className="spice-mote mote-10" />
      <div className="spice-mote mote-11" />
      <div className="spice-mote mote-12" />
    </div>
  );
};

const CodexAtmosphere: React.FC = () => {
  return (
    <div className="codex-atmosphere">
      <div className="parchment-grain" />
      <div className="codex-pyramid">
        <div className="pyramid-capstone" />
        <div className="pyramid-light-beam" />
      </div>
      <div className="codex-stargate">
        <div className="stargate-ring">
          <div className="stargate-chevron chevron-1" />
          <div className="stargate-chevron chevron-2" />
          <div className="stargate-chevron chevron-3" />
          <div className="stargate-chevron chevron-4" />
        </div>
        <div className="event-horizon" />
      </div>
      <div className="candle-glow glow-left" />
      <div className="candle-glow glow-right" />
    </div>
  );
};

const DriftAtmosphere: React.FC = () => {
  return (
    <div className="drift-atmosphere">
      <div className="tokyo-skyline" />
      <div className="asphalt-underglow" />
      <div className="light-trail red-trail-1" />
      <div className="light-trail red-trail-2" />
      <div className="light-trail red-trail-3" />
      <div className="light-trail red-trail-4" />
      <div className="light-trail gold-trail-1" />
      <div className="light-trail gold-trail-2" />
      <div className="light-trail xenon-trail-1" />
      <div className="light-trail xenon-trail-2" />
      <div className="light-trail nitro-trail-1" />
      <div className="speed-streak streak-1" />
      <div className="speed-streak streak-2" />
      <div className="speed-streak streak-3" />
      <div className="speed-streak streak-4" />
      <div className="drift-smoke smoke-1" />
      <div className="drift-smoke smoke-2" />
    </div>
  );
};

const LightningAtmosphere: React.FC = () => {
  return (
    <div className="lightning-atmosphere">
      <div className="storm-flash" />
      <svg className="lightning-bolt bolt-left" viewBox="0 0 200 500">
        <path
          d="M 120 0 L 80 140 L 110 160 L 50 310 L 80 330 L 10 500"
          stroke="#ffffff"
          strokeWidth="3"
          fill="none"
          filter="url(#glow-cyan)"
        />
        <path
          d="M 80 140 L 140 220 M 50 310 L 110 380"
          stroke="#38bdf8"
          strokeWidth="2"
          fill="none"
        />
        <defs>
          <filter id="glow-cyan">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <svg className="lightning-bolt bolt-center" viewBox="0 0 200 600">
        <path
          d="M 100 0 L 130 180 L 90 220 L 150 400 L 110 430 L 170 600"
          stroke="#ffffff"
          strokeWidth="4"
          fill="none"
          filter="url(#glow-cyan)"
        />
        <path
          d="M 130 180 L 60 270 M 150 400 L 80 480"
          stroke="#bae6fd"
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <svg className="lightning-bolt bolt-right" viewBox="0 0 200 500">
        <path
          d="M 70 0 L 110 130 L 80 170 L 130 320 L 90 350 L 140 500"
          stroke="#ffffff"
          strokeWidth="3"
          fill="none"
          filter="url(#glow-cyan)"
        />
        <path
          d="M 110 130 L 160 200 M 130 320 L 180 390"
          stroke="#38bdf8"
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <div className="tesla-arc arc-1" />
      <div className="tesla-arc arc-2" />
    </div>
  );
};

const SakuraAtmosphere: React.FC = () => {
  return (
    <div className="sakura-atmosphere">
      <div className="sakura-moon" />
      <div className="sakura-mist" />
      <div className="paper-lantern lantern-1" />
      <div className="paper-lantern lantern-2" />
      <div className="paper-lantern lantern-3" />
      <div className="paper-lantern lantern-4" />
      <div className="sakura-petal petal-1" />
      <div className="sakura-petal petal-2" />
      <div className="sakura-petal petal-3" />
      <div className="sakura-petal petal-4" />
      <div className="sakura-petal petal-5" />
      <div className="sakura-petal petal-6" />
      <div className="sakura-petal petal-7" />
      <div className="sakura-petal petal-8" />
      <div className="sakura-petal petal-9" />
      <div className="sakura-petal petal-10" />
      <div className="sakura-petal petal-11" />
      <div className="sakura-petal petal-12" />
    </div>
  );
};

const NebulaAtmosphere: React.FC = () => {
  return (
    <div className="nebula-atmosphere">
      <div className="quasar-core" />
      <div className="quasar-ring" />
      <div className="nebula-cloud cloud-1" />
      <div className="nebula-cloud cloud-2" />
      <div className="nebula-cloud cloud-3" />
      <div className="nebula-cloud cloud-4" />
      <div className="comet-trail comet-1" />
      <div className="comet-trail comet-2" />
      <div className="starfire star-1" />
      <div className="starfire star-2" />
      <div className="starfire star-3" />
      <div className="starfire star-4" />
      <div className="starfire star-5" />
      <div className="starfire star-6" />
      <div className="starfire star-7" />
      <div className="starfire star-8" />
    </div>
  );
};

const DragonAtmosphere: React.FC = () => {
  return (
    <div className="dragon-atmosphere">
      <div className="dragon-scale-texture" />
      <div className="magma-chamber" />
      <div className="dragon-flyer">
        <svg className="dragon-svg" viewBox="0 0 300 200">
          <path
            className="dragon-wing wing-left"
            d="M 150 90 Q 90 20 20 50 Q 70 90 100 110 Q 130 105 150 90 Z"
            fill="#dc2626"
            stroke="#991b1b"
            strokeWidth="2"
          />
          <path
            className="dragon-wing wing-right"
            d="M 150 90 Q 210 20 280 50 Q 230 90 200 110 Q 170 105 150 90 Z"
            fill="#dc2626"
            stroke="#991b1b"
            strokeWidth="2"
          />
          <path
            d="M 150 60 Q 160 90 150 140 Q 140 180 120 190 Q 110 195 130 180 Q 145 160 145 130 Q 140 90 150 60 Z"
            fill="#7f1d1d"
          />
          <path
            d="M 150 60 L 140 35 L 146 45 L 150 40 L 154 45 L 160 35 L 150 60 Z"
            fill="#991b1b"
          />
          <circle cx="146" cy="48" r="2.5" fill="#fde047" />
          <circle cx="154" cy="48" r="2.5" fill="#fde047" />
        </svg>
        <div className="fire-breath-stream" />
      </div>
      <div className="dragon-magma-vein vein-1" />
      <div className="dragon-magma-vein vein-2" />
      <div className="dragon-ember spark-1" />
      <div className="dragon-ember spark-2" />
      <div className="dragon-ember spark-3" />
      <div className="dragon-ember spark-4" />
      <div className="dragon-ember spark-5" />
    </div>
  );
};

const StealthAtmosphere: React.FC = () => {
  return (
    <div className="hud-atmosphere">
      <div className="hud-radar-scope">
        <span className="radar-sweep-beam" />
        <span className="radar-ring ring-1" />
        <span className="radar-ring ring-2" />
        <span className="radar-crosshair" />
      </div>
      <div className="hud-pitch-ladder" />

      <div className="stealth-jet jet-leader">
        <svg className="jet-svg" viewBox="0 0 160 100">
          <path
            d="M 160 50 L 60 10 L 40 30 L 10 35 L 25 50 L 10 65 L 40 70 L 60 90 Z"
            fill="#10b981"
            opacity="0.85"
          />
          <ellipse cx="110" cy="50" rx="20" ry="6" fill="#6ee7b7" opacity="0.9" />
        </svg>
        <div className="afterburner-glow" />
        <div className="jet-vapor-trail" />
      </div>

      <div className="stealth-jet jet-wingman">
        <svg className="jet-svg" viewBox="0 0 160 100">
          <path
            d="M 160 50 L 60 10 L 40 30 L 10 35 L 25 50 L 10 65 L 40 70 L 60 90 Z"
            fill="#059669"
            opacity="0.75"
          />
          <ellipse cx="110" cy="50" rx="20" ry="6" fill="#a7f3d0" opacity="0.8" />
        </svg>
        <div className="afterburner-glow" />
        <div className="jet-vapor-trail" />
      </div>

      <div className="stealth-jet jet-recon">
        <svg className="jet-svg" viewBox="0 0 160 100">
          <path
            d="M 160 50 L 70 15 L 45 35 L 15 40 L 30 50 L 15 60 L 45 65 L 70 85 Z"
            fill="#34d399"
            opacity="0.8"
          />
          <ellipse cx="115" cy="50" rx="18" ry="5" fill="#6ee7b7" opacity="0.9" />
        </svg>
        <div className="afterburner-glow" />
        <div className="jet-vapor-trail" />
      </div>

      <div className="sonic-boom-ring boom-1" />
      <div className="sonic-boom-ring boom-2" />
    </div>
  );
};

const ForestAtmosphere: React.FC = () => {
  return (
    <div className="enchanted-atmosphere">
      <div className="forest-mist" />
      <div className="moonlight-shafts" />

      <svg className="enchanted-tree tree-left" viewBox="0 0 400 700">
        <path
          d="M 60 700 Q 110 500 140 350 Q 160 250 120 180 Q 80 120 40 40 M 140 350 Q 220 220 280 140 Q 320 80 350 10 M 150 280 Q 180 190 190 100 M 120 420 Q 50 360 10 320 M 60 700 Q 10 650 -20 700 M 140 700 Q 180 620 240 700"
          stroke="#0f172a"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 60 700 Q 110 500 140 350 Q 160 250 120 180 Q 80 120 40 40 M 140 350 Q 220 220 280 140 Q 320 80 350 10 M 150 280 Q 180 190 190 100 M 120 420 Q 50 360 10 320"
          stroke="#1e293b"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="40" cy="40" r="50" fill="url(#leafGlow1)" opacity="0.85" />
        <circle cx="350" cy="10" r="65" fill="url(#leafGlow2)" opacity="0.85" />
        <circle cx="190" cy="100" r="45" fill="url(#leafGlow1)" opacity="0.8" />
        <circle cx="10" cy="320" r="40" fill="url(#leafGlow2)" opacity="0.75" />
        <defs>
          <radialGradient id="leafGlow1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#059669" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="leafGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#065f46" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      <svg className="enchanted-tree tree-right" viewBox="0 0 400 700">
        <path
          d="M 340 700 Q 290 520 260 380 Q 240 280 280 200 Q 320 130 360 50 M 260 380 Q 180 250 120 160 Q 80 90 50 20 M 250 300 Q 210 210 200 120 M 280 450 Q 340 380 390 340 M 340 700 Q 390 640 420 700 M 260 700 Q 220 630 170 700"
          stroke="#0f172a"
          strokeWidth="26"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 340 700 Q 290 520 260 380 Q 240 280 280 200 Q 320 130 360 50 M 260 380 Q 180 250 120 160 Q 80 90 50 20 M 250 300 Q 210 210 200 120"
          stroke="#1e293b"
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="360" cy="50" r="60" fill="url(#leafGlow2)" opacity="0.85" />
        <circle cx="50" cy="20" r="70" fill="url(#leafGlow1)" opacity="0.85" />
        <circle cx="200" cy="120" r="45" fill="url(#leafGlow2)" opacity="0.8" />
        <circle cx="390" cy="340" r="40" fill="url(#leafGlow1)" opacity="0.75" />
      </svg>

      <div className="firefly fly-1" />
      <div className="firefly fly-2" />
      <div className="firefly fly-3" />
      <div className="firefly fly-4" />
      <div className="firefly fly-5" />
      <div className="firefly fly-6" />
      <div className="firefly fly-7" />
      <div className="firefly fly-8" />
    </div>
  );
};

const CyberpunkAtmosphere: React.FC = () => {
  return (
    <div className="cyberpunk-atmosphere">
      <div className="cyber-skyline" />
      <div className="puddle-reflection-grid" />
      <div className="neon-signboard signboard-1">
        <span className="sign-kanji">サイバー</span>
        <span className="sign-sub">CYBER 2077</span>
      </div>
      <div className="neon-signboard signboard-2">
        <span className="sign-kanji">電脳街</span>
        <span className="sign-sub">NETRUNNER</span>
      </div>
      <div className="neon-signboard signboard-3">
        <span className="sign-kanji">ネオン</span>
        <span className="sign-sub">NEON GRID</span>
      </div>
      <div className="hover-spinner spinner-1">
        <div className="spinner-beam headlight" />
        <div className="spinner-beam taillight" />
      </div>
      <div className="hover-spinner spinner-2">
        <div className="spinner-beam headlight" />
        <div className="spinner-beam taillight" />
      </div>
      <div className="hover-spinner spinner-3">
        <div className="spinner-beam headlight" />
        <div className="spinner-beam taillight" />
      </div>
      <div className="rain-streak drop-1" />
      <div className="rain-streak drop-2" />
      <div className="rain-streak drop-3" />
      <div className="rain-streak drop-4" />
      <div className="rain-streak drop-5" />
      <div className="rain-streak drop-6" />
      <div className="rain-streak drop-7" />
      <div className="rain-streak drop-8" />
      <div className="rain-streak drop-9" />
      <div className="rain-streak drop-10" />
    </div>
  );
};

const DeepSeaAtmosphere: React.FC = () => {
  return (
    <div className="deepsea-atmosphere">
      <div className="abyssal-glow" />
      <div className="ocean-caustic-beam beam-1" />
      <div className="ocean-caustic-beam beam-2" />

      <div className="biolum-whale whale-1">
        <svg className="whale-svg" viewBox="0 0 500 200">
          <path
            d="M 50 100 Q 120 30 280 40 Q 400 50 460 90 Q 490 100 480 120 Q 450 140 380 150 Q 250 160 120 150 Q 70 140 50 100 Z"
            fill="url(#whaleGrad1)"
            filter="url(#whaleGlow)"
          />
          <path
            className="whale-fluke"
            d="M 50 100 Q 20 60 0 40 Q 20 90 50 100 Q 20 110 0 160 Q 20 140 50 100 Z"
            fill="#0284c7"
          />
          <path
            d="M 160 145 Q 260 150 360 140 M 180 135 Q 260 140 340 130"
            stroke="#38bdf8"
            strokeWidth="2"
            fill="none"
            opacity="0.7"
          />
          <circle cx="410" cy="85" r="4" fill="#6ee7b7" />
          <defs>
            <linearGradient id="whaleGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0369a1" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#0284c7" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.8" />
            </linearGradient>
            <filter id="whaleGlow">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
        <div className="blowhole-plume" />
      </div>

      <div className="biolum-whale whale-2">
        <svg className="whale-svg" viewBox="0 0 500 200">
          <path
            d="M 450 100 Q 380 30 220 40 Q 100 50 40 90 Q 10 100 20 120 Q 50 140 120 150 Q 250 160 380 150 Q 430 140 450 100 Z"
            fill="url(#whaleGrad2)"
            filter="url(#whaleGlow)"
          />
          <path
            className="whale-fluke"
            d="M 450 100 Q 480 60 500 40 Q 480 90 450 100 Q 480 110 500 160 Q 480 140 450 100 Z"
            fill="#0d9488"
          />
          <circle cx="90" cy="85" r="4" fill="#a7f3d0" />
          <defs>
            <linearGradient id="whaleGrad2" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0f766e" stopOpacity="0.3" />
              <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.75" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="biolum-manta">
        <svg className="manta-svg" viewBox="0 0 200 120">
          <path
            className="manta-wings"
            d="M 100 10 Q 40 50 0 90 Q 60 80 100 110 Q 140 80 200 90 Q 160 50 100 10 Z"
            fill="#06b6d4"
            opacity="0.8"
          />
          <path d="M 100 110 L 100 160" stroke="#38bdf8" strokeWidth="2" />
        </svg>
      </div>

      <div className="biolum-jelly jelly-1">
        <span className="jelly-bell" />
        <span className="jelly-tentacles" />
      </div>
      <div className="biolum-jelly jelly-2">
        <span className="jelly-bell" />
        <span className="jelly-tentacles" />
      </div>
      <div className="biolum-jelly jelly-3">
        <span className="jelly-bell" />
        <span className="jelly-tentacles" />
      </div>

      <div className="sea-plankton p-1" />
      <div className="sea-plankton p-2" />
      <div className="sea-plankton p-3" />
      <div className="sea-plankton p-4" />
      <div className="sea-bubble bubble-1" />
      <div className="sea-bubble bubble-2" />
      <div className="sea-bubble bubble-3" />
      <div className="sea-bubble bubble-4" />
    </div>
  );
};

const AetheriumAtmosphere: React.FC = () => {
  return (
    <div className="theme-atmosphere aetherium-atmosphere" aria-hidden="true">
      <div className="aetherium-aurora-ribbon ribbon-1" />
      <div className="aetherium-aurora-ribbon ribbon-2" />
      <div className="aetherium-veil" />

      <div className="aetherium-island island-left">
        <svg className="island-svg" viewBox="0 0 300 200">
          <path
            d="M 50 100 Q 150 40 250 100 Q 200 160 150 190 Q 100 160 50 100 Z"
            fill="url(#islandGrad)"
            stroke="#c084fc"
            strokeWidth="2"
          />
          <polygon points="120,60 135,15 150,60" fill="#e9d5ff" />
          <polygon points="150,70 165,25 180,70" fill="#f472b6" />
          <polygon points="100,75 110,40 120,75" fill="#38bdf8" />
          <defs>
            <linearGradient id="islandGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b0764" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.9" />
            </linearGradient>
          </defs>
        </svg>
        <div className="aether-waterfall" />
      </div>

      <div className="aetherium-island island-right">
        <svg className="island-svg" viewBox="0 0 250 160">
          <path
            d="M 40 80 Q 125 30 210 80 Q 160 130 125 150 Q 90 130 40 80 Z"
            fill="url(#islandGrad)"
            stroke="#f472b6"
            strokeWidth="2"
          />
          <polygon points="110,50 125,10 140,50" fill="#fef08a" />
          <polygon points="140,55 150,20 160,55" fill="#c084fc" />
        </svg>
        <div className="aether-waterfall" />
      </div>

      <div className="aether-crystal crystal-1" />
      <div className="aether-crystal crystal-2" />
      <div className="aether-crystal crystal-3" />

      <div className="aether-mote mote-1" />
      <div className="aether-mote mote-2" />
      <div className="aether-mote mote-3" />
      <div className="aether-mote mote-4" />
      <div className="aether-mote mote-5" />
      <div className="aether-mote mote-6" />
    </div>
  );
};

const BrassAtmosphere: React.FC = () => {
  return (
    <div className="theme-atmosphere brass-atmosphere" aria-hidden="true">
      <div className="steam-cloud cloud-1" />
      <div className="steam-cloud cloud-2" />
      <div className="steam-cloud cloud-3" />

      <div className="brass-gear gear-large gear-1">
        <svg className="gear-svg" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" fill="none" stroke="#d97706" strokeWidth="20" strokeDasharray="12 6" />
          <circle cx="100" cy="100" r="45" fill="#78350f" stroke="#b45309" strokeWidth="6" />
          <circle cx="100" cy="100" r="18" fill="#fef08a" />
          <line x1="100" y1="20" x2="100" y2="180" stroke="#b45309" strokeWidth="8" />
          <line x1="20" y1="100" x2="180" y2="100" stroke="#b45309" strokeWidth="8" />
        </svg>
      </div>

      <div className="brass-gear gear-medium gear-2">
        <svg className="gear-svg" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="55" fill="none" stroke="#f59e0b" strokeWidth="16" strokeDasharray="10 5" />
          <circle cx="80" cy="80" r="35" fill="#92400e" stroke="#d97706" strokeWidth="5" />
          <circle cx="80" cy="80" r="14" fill="#fef08a" />
          <line x1="80" y1="15" x2="80" y2="145" stroke="#d97706" strokeWidth="6" />
          <line x1="15" y1="80" x2="145" y2="80" stroke="#d97706" strokeWidth="6" />
        </svg>
      </div>

      <div className="brass-gear gear-small gear-3">
        <svg className="gear-svg" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="40" fill="none" stroke="#d97706" strokeWidth="12" strokeDasharray="8 4" />
          <circle cx="60" cy="60" r="24" fill="#78350f" stroke="#b45309" strokeWidth="4" />
          <circle cx="60" cy="60" r="10" fill="#fef08a" />
        </svg>
      </div>

      <div className="brass-gauge gauge-1">
        <div className="gauge-dial">
          <div className="gauge-needle" />
          <span className="gauge-cap" />
        </div>
      </div>

      <div className="steam-vent vent-1" />
      <div className="steam-vent vent-2" />
    </div>
  );
};

const MatrixAtmosphere: React.FC = () => {
  return (
    <div className="matrix-atmosphere">
      <div className="matrix-crt-scanlines" />
      <div className="matrix-phosphor-bloom" />
      <div className="matrix-code-stream stream-1"><span className="stream-head">01</span></div>
      <div className="matrix-code-stream stream-2"><span className="stream-head">10</span></div>
      <div className="matrix-code-stream stream-3"><span className="stream-head">11</span></div>
      <div className="matrix-code-stream stream-4"><span className="stream-head">00</span></div>
      <div className="matrix-code-stream stream-5"><span className="stream-head">10</span></div>
      <div className="matrix-code-stream stream-6"><span className="stream-head">01</span></div>
      <div className="matrix-code-stream stream-7"><span className="stream-head">11</span></div>
      <div className="matrix-code-stream stream-8"><span className="stream-head">10</span></div>
      <div className="matrix-code-stream stream-9"><span className="stream-head">01</span></div>
      <div className="matrix-code-stream stream-10"><span className="stream-head">00</span></div>
      <div className="matrix-code-stream stream-11"><span className="stream-head">11</span></div>
      <div className="matrix-code-stream stream-12"><span className="stream-head">10</span></div>
    </div>
  );
};

const DefaultAtmosphere: React.FC = () => {
  return null;
};

const SynthwaveAtmosphere: React.FC = () => {
  return (
    <div className="synthwave-atmosphere">
      <div className="synth-sky-glow" />

      <div className="synth-sun">
        <div className="sun-slice slice-1" />
        <div className="sun-slice slice-2" />
        <div className="sun-slice slice-3" />
        <div className="sun-slice slice-4" />
        <div className="sun-slice slice-5" />
      </div>

      <svg className="synth-mountains-svg" viewBox="0 0 1200 200" preserveAspectRatio="none">
        <polyline
          points="0,200 150,110 280,160 420,70 580,150 720,60 880,140 1020,80 1200,200"
          fill="rgba(15, 5, 29, 0.9)"
          stroke="#ec4899"
          strokeWidth="3"
        />
        <polyline
          points="0,200 120,130 250,170 380,90 520,160 680,90 820,160 980,110 1200,200"
          fill="rgba(29, 9, 54, 0.6)"
          stroke="#06b6d4"
          strokeWidth="2"
        />
      </svg>

      <div className="synth-grid-floor" />

      <div className="synth-palm palm-left">
        <svg className="palm-svg" viewBox="0 0 120 180">
          <path d="M 50 180 Q 45 100 60 40" stroke="#1d0936" strokeWidth="8" fill="none" />
          <path d="M 60 40 Q 20 20 0 40 M 60 40 Q 30 5 10 0 M 60 40 Q 90 5 110 0 M 60 40 Q 100 20 120 40" stroke="#ec4899" strokeWidth="3" fill="none" />
        </svg>
      </div>

      <div className="synth-palm palm-right">
        <svg className="palm-svg" viewBox="0 0 120 180">
          <path d="M 70 180 Q 75 100 60 40" stroke="#1d0936" strokeWidth="8" fill="none" />
          <path d="M 60 40 Q 20 20 0 40 M 60 40 Q 30 5 10 0 M 60 40 Q 90 5 110 0 M 60 40 Q 100 20 120 40" stroke="#06b6d4" strokeWidth="3" fill="none" />
        </svg>
      </div>
    </div>
  );
};

const CIRCUIT_PRESETS = [
  // Preset 1: Silverstone Sweeping Loop
  "M 220,250 C 450,110 750,110 1020,180 C 1280,250 1440,200 1480,350 C 1520,500 1380,590 1220,540 C 1060,490 920,620 810,740 C 700,860 440,860 280,780 C 130,700 80,540 120,380 C 150,250 120,280 220,250 Z",
  // Preset 2: Monaco Coastal Loop
  "M 180,320 C 350,150 700,120 1000,150 C 1300,180 1480,260 1450,420 C 1420,580 1250,720 1050,780 C 850,840 550,820 380,720 C 210,620 120,480 180,320 Z",
  // Preset 3: Spa Francorchamps High-Speed Loop
  "M 250,200 C 580,100 920,140 1200,220 C 1480,300 1520,480 1380,620 C 1240,760 980,820 720,780 C 460,740 180,700 140,520 C 100,340 120,240 250,200 Z",
  // Preset 4: Suzuka Technical Loop
  "M 200,400 C 250,200 550,140 850,220 C 1150,300 1420,180 1480,340 C 1540,500 1320,680 1100,600 C 880,520 700,750 450,820 C 200,890 120,600 200,400 Z",
  // Preset 5: Nürburgring Endurance Loop
  "M 300,180 C 650,120 1000,160 1350,220 C 1500,360 1450,560 1280,720 C 1110,880 750,850 480,780 C 210,710 120,520 160,340 C 200,160 180,220 300,180 Z",
  // Preset 6: Red Bull Ring Speedway
  "M 220,180 C 600,120 1050,100 1420,200 C 1520,380 1380,580 1180,680 C 980,780 620,840 340,760 C 140,680 100,420 140,280 C 160,180 150,220 220,180 Z",
];

function generateRandomRaceTrack(): string {
  const basePreset = CIRCUIT_PRESETS[Math.floor(Math.random() * CIRCUIT_PRESETS.length)];
  return basePreset.replace(/-?\d+(\.\d+)?/g, (match) => {
    const num = Number.parseFloat(match);
    const delta = Math.floor((Math.random() - 0.5) * 30);
    return String(Math.max(40, num + delta));
  });
}

interface SpiralStar {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
  animationClass: string;
}

function generateSpiralGalaxyStars(): SpiralStar[] {
  const stars: SpiralStar[] = [];
  const arms = 2;
  const starsPerArm = 25;
  const colors = [
    "#ffffff", "#fef08a", "#bae6fd", "#7dd3fc", 
    "#f472b6", "#c084fc", "#a855f7", "#38bdf8", "#fbbf24"
  ];
  const animations = ["star-twinkle-1", "star-twinkle-2", ""];

  // 1. Core Cluster (20 stars)
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 1.8) * 85;
    const x = 400 + Math.cos(angle) * dist;
    const y = 400 + Math.sin(angle) * dist;
    const size = 1.5 + Math.random() * 3.5;
    const color = colors[Math.floor(Math.random() * 4)];
    stars.push({
      cx: Math.round(x * 10) / 10,
      cy: Math.round(y * 10) / 10,
      r: Math.round(size * 10) / 10,
      fill: color,
      opacity: Math.round((0.65 + Math.random() * 0.35) * 100) / 100,
      animationClass: animations[Math.floor(Math.random() * animations.length)],
    });
  }

  // 2. Logarithmic Spiral Arm Stars (2 arms x 25 stars = 50 stars)
  for (let arm = 0; arm < arms; arm++) {
    const baseAngle = (arm * Math.PI * 2) / arms;
    for (let i = 0; i < starsPerArm; i++) {
      const progress = i / starsPerArm;
      const theta = baseAngle + progress * Math.PI * 2.8;
      const radius = 35 + Math.pow(progress, 1.15) * 330;
      
      const scatterR = (Math.random() - 0.5) * (16 + progress * 42);
      const scatterTheta = (Math.random() - 0.5) * 0.22;
      
      const rFinal = radius + scatterR;
      const thetaFinal = theta + scatterTheta;
      
      const x = 400 + Math.cos(thetaFinal) * rFinal;
      const y = 400 + Math.sin(thetaFinal) * rFinal;
      
      const isSupergiant = Math.random() < 0.08;
      const size = isSupergiant ? (2.5 + Math.random() * 2.0) : (1.2 + Math.random() * 2.0);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const opacity = Math.round((0.4 + Math.random() * 0.55) * 100) / 100;
      
      stars.push({
        cx: Math.round(x * 10) / 10,
        cy: Math.round(y * 10) / 10,
        r: Math.round(size * 10) / 10,
        fill: color,
        opacity,
        animationClass: animations[Math.floor(Math.random() * animations.length)],
      });
    }
  }

  return stars;
}

function loadMaxRows(): number {
  const raw = localStorage.getItem(MAX_ROWS_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_ROWS;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_ROWS;
  return Math.min(parsed, 100_000);
}

function loadFontScale(): number {
  const raw = localStorage.getItem(FONT_SCALE_KEY);
  const parsed = raw ? Number.parseFloat(raw) : DEFAULT_FONT_SCALE;
  if (!Number.isFinite(parsed)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, parsed));
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

function loadEditorSplit(): number {
  const raw = localStorage.getItem(EDITOR_SPLIT_KEY);
  const parsed = raw ? Number.parseFloat(raw) : DEFAULT_EDITOR_SPLIT;
  if (!Number.isFinite(parsed)) return DEFAULT_EDITOR_SPLIT;
  return Math.min(MAX_EDITOR_SPLIT, Math.max(MIN_EDITOR_SPLIT, parsed));
}

function loadSidebarWidth(): number {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_SIDEBAR_WIDTH;
  if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed));
}

function loadRememberPassword(): boolean {
  const raw = localStorage.getItem(REMEMBER_PASSWORD_KEY);
  if (raw === null) return true;
  return raw === "true";
}

const SAVED_CONNECTIONS_KEY = "oracle-ide.saved-connections";
const LAST_CONNECTION_ID_KEY = "oracle-ide.last-connection-id";
const AUTO_FORMAT_KEY = "oracle-ide.auto-format";

export interface SavedConnection {
  id: string;
  name: string;
  user: string;
  host: string;
  port: string;
  service: string;
  tcps?: boolean;
  isProd?: boolean;
}

function loadSavedConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(SAVED_CONNECTIONS_KEY);
    return raw ? (JSON.parse(raw) as SavedConnection[]) : [];
  } catch {
    return [];
  }
}

function loadInitialConnectionState(savedConns: SavedConnection[]) {
  const lastId = localStorage.getItem(LAST_CONNECTION_ID_KEY);
  let matched = savedConns.find((c) => c.id === lastId);

  if (!matched && savedConns.length > 0) {
    try {
      const savedConfigRaw = localStorage.getItem("oracle-ide.connection");
      if (savedConfigRaw) {
        const parsed = JSON.parse(savedConfigRaw);
        matched = savedConns.find(
          (c) =>
            c.user === parsed.user &&
            c.host === parsed.host &&
            c.service === parsed.service &&
            (c.port ?? "1521") === (parsed.port ?? "1521"),
        );
      }
    } catch {
      // ignore
    }
    if (!matched) {
      matched = savedConns[0];
    }
  }

  if (matched) {
    return {
      selectedConnectionId: matched.id,
      connectionName: matched.name,
      isProd: !!matched.isProd,
      config: {
        user: matched.user,
        password: "",
        host: matched.host,
        port: matched.port,
        service: matched.service,
        tcps: !!matched.tcps,
      },
    };
  }

  let fallbackConfig = EMPTY_CONNECTION;
  try {
    const saved = localStorage.getItem("oracle-ide.connection");
    if (saved) {
      fallbackConfig = { ...EMPTY_CONNECTION, ...JSON.parse(saved), password: "" };
    }
  } catch {
    // ignore
  }

  return {
    selectedConnectionId: "",
    connectionName: "",
    isProd: false,
    config: fallbackConfig,
  };
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>(() => loadSavedConnections());
  const initialConnState = useMemo(
    () => loadInitialConnectionState(savedConnections),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [config, setConfig] = useState<ConnectionConfig>(initialConnState.config);
  const [status, setStatus] = useState<ConnectionState>({ connected: false });
  const [tabs, setTabs] = useState<SqlTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [sqlDir, setSqlDir] = useState("~/sql");
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [globalHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [tabStates, setTabStates] = useState<Record<string, TabState>>({});

  const defaultTabState = useMemo<TabState>(
    () => ({
      result: null,
      explainResult: null,
      explainError: null,
      editMeta: null,
      pendingEdits: {},
      bottomTab: "results",
      history: globalHistory,
      bindValues: {},
      message: "Ready",
      error: null,
      queryStartTime: null,
      queryElapsedTimeMs: 0,
    }),
    [globalHistory],
  );

  const activeTabState = useMemo<TabState>(() => {
    if (!activeTabId) return defaultTabState;
    return tabStates[activeTabId] ?? defaultTabState;
  }, [activeTabId, tabStates, defaultTabState]);

  const updateActiveTabState = useCallback(
    (updater: Partial<TabState> | ((prev: TabState) => Partial<TabState>)) => {
      if (!activeTabId) return;
      setTabStates((prevMap) => {
        const current = prevMap[activeTabId] ?? defaultTabState;
        const patch = typeof updater === "function" ? updater(current) : updater;
        return {
          ...prevMap,
          [activeTabId]: { ...current, ...patch },
        };
      });
    },
    [activeTabId, defaultTabState],
  );

  const result = activeTabState.result;
  const setResult = useCallback(
    (val: QueryResult | null | ((prev: QueryResult | null) => QueryResult | null)) => {
      updateActiveTabState((prev: TabState) => ({
        result: typeof val === "function" ? val(prev.result) : val,
      }));
    },
    [updateActiveTabState],
  );

  const explainResult = activeTabState.explainResult;
  const setExplainResult = useCallback(
    (val: QueryResult | null | ((prev: QueryResult | null) => QueryResult | null)) => {
      updateActiveTabState((prev: TabState) => ({
        explainResult: typeof val === "function" ? val(prev.explainResult) : val,
      }));
    },
    [updateActiveTabState],
  );

  const explainError = activeTabState.explainError;
  const setExplainError = useCallback(
    (val: string | null | ((prev: string | null) => string | null)) => {
      updateActiveTabState((prev: TabState) => ({
        explainError: typeof val === "function" ? val(prev.explainError) : val,
      }));
    },
    [updateActiveTabState],
  );

  const editMeta = activeTabState.editMeta;
  const setEditMeta = useCallback(
    (val: EditMeta | null | ((prev: EditMeta | null) => EditMeta | null)) => {
      updateActiveTabState((prev: TabState) => ({
        editMeta: typeof val === "function" ? val(prev.editMeta) : val,
      }));
    },
    [updateActiveTabState],
  );

  const pendingEdits = activeTabState.pendingEdits;
  const setPendingEdits = useCallback(
    (val: Record<string, CellEdit> | ((prev: Record<string, CellEdit>) => Record<string, CellEdit>)) => {
      updateActiveTabState((prev: TabState) => ({
        pendingEdits: typeof val === "function" ? val(prev.pendingEdits) : val,
      }));
    },
    [updateActiveTabState],
  );

  const bottomTab = activeTabState.bottomTab;
  const setBottomTab = useCallback(
    (val: "results" | "history" | "explain" | ((prev: "results" | "history" | "explain") => "results" | "history" | "explain")) => {
      updateActiveTabState((prev: TabState) => ({
        bottomTab: typeof val === "function" ? val(prev.bottomTab) : val,
      }));
    },
    [updateActiveTabState],
  );

  const history = activeTabState.history;
  const setHistory = useCallback(
    (val: HistoryEntry[] | ((prev: HistoryEntry[]) => HistoryEntry[])) => {
      updateActiveTabState((prev: TabState) => ({
        history: typeof val === "function" ? val(prev.history) : val,
      }));
    },
    [updateActiveTabState],
  );

  const bindValues = activeTabState.bindValues;
  const setBindValues = useCallback(
    (
      val:
        | Record<string, BindVarParam>
        | ((prev: Record<string, BindVarParam>) => Record<string, BindVarParam>),
    ) => {
      updateActiveTabState((prev: TabState) => ({
        bindValues: typeof val === "function" ? val(prev.bindValues) : val,
      }));
    },
    [updateActiveTabState],
  );

  const [bindModalState, setBindModalState] = useState<{
    open: boolean;
    varNames: string[];
    action: "execute" | "explain";
    rawSql: string;
  } | null>(null);

  const manageBackdropMouseDownRef = useRef(false);

  const handleManageBackdropMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    manageBackdropMouseDownRef.current = e.target === e.currentTarget;
  }, []);

  const handleManageBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (manageBackdropMouseDownRef.current && e.target === e.currentTarget) {
      setShowManageModal(false);
    }
    manageBackdropMouseDownRef.current = false;
  }, []);

  const message = activeTabState.message;
  const setMessage = useCallback(
    (val: string | ((prev: string) => string)) => {
      updateActiveTabState((prev: TabState) => ({
        message: typeof val === "function" ? val(prev.message) : val,
      }));
    },
    [updateActiveTabState],
  );

  const error = activeTabState.error;
  const setError = useCallback(
    (val: string | null | ((prev: string | null) => string | null)) => {
      updateActiveTabState((prev: TabState) => ({
        error: typeof val === "function" ? val(prev.error) : val,
      }));
    },
    [updateActiveTabState],
  );

  const queryStartTime = activeTabState.queryStartTime;
  const setQueryStartTime = useCallback(
    (val: number | null | ((prev: number | null) => number | null)) => {
      updateActiveTabState((prev: TabState) => ({
        queryStartTime: typeof val === "function" ? val(prev.queryStartTime) : val,
      }));
    },
    [updateActiveTabState],
  );

  const queryElapsedTimeMs = activeTabState.queryElapsedTimeMs;
  const setQueryElapsedTimeMs = useCallback(
    (val: number | ((prev: number) => number)) => {
      updateActiveTabState((prev: TabState) => ({
        queryElapsedTimeMs: typeof val === "function" ? val(prev.queryElapsedTimeMs) : val,
      }));
    },
    [updateActiveTabState],
  );

  const [busy, setBusy] = useState(false);
  const [objectsRefresh, setObjectsRefresh] = useState(0);
  const [maxRows, setMaxRows] = useState(loadMaxRows);
  const [density, setDensity] = useState<GridDensity>(loadDensity);
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [themeId, setThemeId] = useState<AppThemeId>(loadTheme);

  const [planetSeed, setPlanetSeed] = useState(() =>
    Math.floor(Date.now() + performance.now() * 1000 + Math.random() * 1000000)
  );

  useEffect(() => {
    setPlanetSeed(
      Math.floor(Date.now() + performance.now() * 1000 + Math.random() * 1000000)
    );
  }, [themeId]);

  // Space theme procedurally generated celestial planets (seeded by Date-Time on app start & theme switch)
  const spacePlanets = useMemo(() => {
    if (themeId !== "spaceship") return [];
    return generateSeededPlanets(planetSeed);
  }, [themeId, planetSeed]);

  // Randomized 3D Race Track circuit layout generated on app load / theme selection
  const raceTrackPath = useMemo(() => {
    if (themeId !== "racecar") return CIRCUIT_PRESETS[0];
    return generateRandomRaceTrack();
  }, [themeId]);

  // Procedurally generated stellar particle spiral galaxy stars
  const galaxyStars = useMemo(() => {
    if (themeId !== "spaceship") return [];
    return generateSpiralGalaxyStars();
  }, [themeId]);
  const [editorSplit, setEditorSplit] = useState(loadEditorSplit);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [queryTabsWidth, setQueryTabsWidth] = useState(loadQueryTabsWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };
  const [rememberPassword, setRememberPassword] = useState(loadRememberPassword);
  const [passwordStorageAvailable, setPasswordStorageAvailable] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(initialConnState.selectedConnectionId);
  const [connectionName, setConnectionName] = useState<string>(initialConnState.connectionName);
  const [isProd, setIsProd] = useState<boolean>(initialConnState.isProd);
  const [preProdThemeId, setPreProdThemeId] = useState<AppThemeId>("default");
  const [showManageModal, setShowManageModal] = useState<boolean>(false);
  const [showProdCommitConfirm, setShowProdCommitConfirm] = useState<boolean>(false);
  const [autoFormat, setAutoFormat] = useState<boolean>(() => localStorage.getItem(AUTO_FORMAT_KEY) === "true");

  // Real-time query execution length timer loop
  useEffect(() => {
    if (!busy || !queryStartTime) {
      setQueryElapsedTimeMs(0);
      return;
    }
    setQueryElapsedTimeMs(Date.now() - queryStartTime);
    const interval = setInterval(() => {
      setQueryElapsedTimeMs(Date.now() - queryStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [busy, queryStartTime, setQueryElapsedTimeMs]);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoApiRef = useRef<Parameters<BeforeMount>[0] | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const splitDragRef = useRef<{
    startY: number;
    startSplit: number;
    available: number;
  } | null>(null);
  const sidebarDragRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const passwordSaveTimerRef = useRef<number | null>(null);
  const rememberPasswordRef = useRef(rememberPassword);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const saveTimerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const busyRef = useRef(busy);

  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  rememberPasswordRef.current = rememberPassword;
  busyRef.current = busy;

  const isNotConnectedError = useCallback((err: unknown) => {
    const text = err instanceof Error ? err.message : String(err);
    return /not connected to oracle/i.test(text);
  }, []);

  const forceDisconnect = useCallback(
    async (reason: string) => {
      try {
        await window.oracle.disconnect();
      } catch {
        // ignore — already gone
      }
      setStatus({ connected: false, mode: "jdbc" });
      setPendingEdits({});
      setEditMeta(null);
      if (isProd || themeId === "nuclear") {
        const fallback = preProdThemeId && preProdThemeId !== "nuclear" ? preProdThemeId : "default";
        setThemeId(fallback);
        localStorage.setItem(THEME_KEY, fallback);
        applyThemeToDocument(fallback);
      }
      setError(reason);
      setMessage("Connection lost — disconnected");
    },
    [isProd, preProdThemeId, themeId],
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const sql = activeTab?.sql ?? "";

  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [editorTick, setEditorTick] = useState(0);
  const [editorLineHeight, setEditorLineHeight] = useState(18);
  const [selectedExplainQueryIndex, setSelectedExplainQueryIndex] = useState<number>(0);
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setEditorTick((t) => t + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      setEditorScrollTop(editorRef.current.getScrollTop());
      setEditorTick((t) => t + 1);
    }
  }, [activeTabId, fontScale]);

  const sqlBlocks = useMemo(() => parseSqlStatements(sql), [sql]);

  const handleCopyQueryBlock = useCallback(
    (block: SqlStatementBlock) => {
      void navigator.clipboard.writeText(block.text);
      setCopiedBlockId(block.id);
      setMessage(`Copied query (Lines ${block.startLine}–${block.endLine}) to clipboard`);
      window.setTimeout(() => {
        setCopiedBlockId(null);
      }, 1800);
    },
    [setMessage],
  );

  const persistPassword = useCallback(async (password: string, remember: boolean) => {
    try {
      if (!remember || !password) {
        await window.oracle.clearPassword();
        return;
      }
      await window.oracle.savePassword(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const schedulePasswordSave = useCallback(
    (password: string) => {
      if (passwordSaveTimerRef.current != null) {
        window.clearTimeout(passwordSaveTimerRef.current);
      }
      passwordSaveTimerRef.current = window.setTimeout(() => {
        passwordSaveTimerRef.current = null;
        void persistPassword(password, rememberPasswordRef.current);
      }, PASSWORD_SAVE_DEBOUNCE_MS);
    },
    [persistPassword],
  );

  const persistWorkspace = useCallback(async (immediate = false) => {
    if (!hydratedRef.current) return;

    const payload = {
      tabs: tabsRef.current,
      activeTabId: activeTabIdRef.current,
    };

    const runSave = async () => {
      setSaveState("saving");
      try {
        const saved = await window.oracle.saveWorkspace(payload);
        if (saved.path) {
          setSqlDir(saved.path);
        }
        const nextTabs = saved.tabs;
        const prev = tabsRef.current;
        const changed =
          prev.length !== nextTabs.length ||
          prev.some(
            (tab, index) =>
              tab.fileName !== nextTabs[index]?.fileName ||
              tab.id !== nextTabs[index]?.id ||
              tab.title !== nextTabs[index]?.title,
          );
        if (changed) {
          skipNextSaveRef.current = true;
          setTabs(nextTabs);
          const stillActive = nextTabs.find(
            (tab) =>
              tab.id === activeTabIdRef.current ||
              tab.fileName === activeTabIdRef.current,
          );
          if (stillActive) {
            setActiveTabId(stillActive.id);
          } else if (nextTabs[0]) {
            setActiveTabId(nextTabs[0].id);
          }
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    };

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (immediate) {
      await runSave();
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void runSave();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    window.oracle.getStatus().then(setStatus).catch(() => undefined);
  }, []);

  // While connected, periodically verify the session is still alive.
  // If the probe fails, force a disconnect and restore non-PROD theme.
  useEffect(() => {
    if (!status.connected) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || busyRef.current) return;
      try {
        const next = await window.oracle.getStatus();
        if (cancelled) return;
        if (!next.connected) {
          await forceDisconnect("Oracle session is no longer valid");
        }
      } catch (err) {
        if (cancelled) return;
        await forceDisconnect(
          err instanceof Error ? err.message : "Connection check failed",
        );
      }
    };

    const timer = window.setInterval(() => {
      void tick();
    }, CONNECTION_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status.connected, forceDisconnect]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const available = await window.oracle.isPasswordStorageAvailable();
        if (cancelled) return;
        setPasswordStorageAvailable(available);
        if (!available || !loadRememberPassword()) return;
        const password = await window.oracle.loadPassword();
        if (!cancelled && password) {
          setConfig((prev) => ({ ...prev, password }));
        }
      } catch {
        // leave password empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(REMEMBER_PASSWORD_KEY, String(rememberPassword));
  }, [rememberPassword]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const disk = await window.oracle.loadWorkspace();
        if (cancelled) return;
        skipNextSaveRef.current = true;
        const nextTabs = disk?.tabs ?? [];
        setTabs(nextTabs);
        setActiveTabId(
          disk?.activeTabId && nextTabs.some((tab) => tab.id === disk.activeTabId)
            ? disk.activeTabId
            : (nextTabs[0]?.id ?? ""),
        );
        if (disk?.sqlDir) setSqlDir(disk.sqlDir);
        setSaveState("saved");
        const count = nextTabs.length;
        setMessage(
          count > 0
            ? `Restored ${count} SQL page${count === 1 ? "" : "s"} · ${disk?.sqlDir ?? "~/sql"}`
            : `No open SQL pages · ${disk?.sqlDir ?? "~/sql"} · Cmd+O to open · Cmd+T for new`,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setMessage("Could not restore SQL pages");
        }
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setWorkspaceHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    void persistWorkspace(false);
  }, [tabs, activeTabId, persistWorkspace]);

  useEffect(() => {
    const flush = () => {
      void persistWorkspace(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [persistWorkspace]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }, [history]);

  useEffect(() => {
    if (!window.oracle?.loadSettings) return;
    window.oracle
      .loadSettings()
      .then((diskSettings) => {
        if (!diskSettings || typeof diskSettings !== "object") return;
        if (typeof diskSettings.theme === "string") {
          setThemeId(diskSettings.theme as AppThemeId);
          localStorage.setItem(THEME_KEY, diskSettings.theme);
          applyThemeToDocument(diskSettings.theme as AppThemeId);
        }
        if (typeof diskSettings.fontScale === "number" && Number.isFinite(diskSettings.fontScale)) {
          setFontScale(diskSettings.fontScale);
          localStorage.setItem(FONT_SCALE_KEY, String(diskSettings.fontScale));
          document.documentElement.style.setProperty(
            "--font-scale",
            String(roundScale(diskSettings.fontScale * 0.75)),
          );
        }
        if (
          typeof diskSettings.density === "string" &&
          (diskSettings.density === "normal" || diskSettings.density === "compact" || diskSettings.density === "crammed")
        ) {
          setDensity(diskSettings.density as GridDensity);
          localStorage.setItem(DENSITY_KEY, diskSettings.density);
        }
        if (typeof diskSettings.maxRows === "number" && Number.isFinite(diskSettings.maxRows) && diskSettings.maxRows >= 1) {
          setMaxRows(diskSettings.maxRows);
          localStorage.setItem(MAX_ROWS_KEY, String(diskSettings.maxRows));
        }
        if (typeof diskSettings.editorSplit === "number" && Number.isFinite(diskSettings.editorSplit)) {
          setEditorSplit(diskSettings.editorSplit);
          localStorage.setItem(EDITOR_SPLIT_KEY, String(diskSettings.editorSplit));
        }
        if (typeof diskSettings.sidebarWidth === "number" && Number.isFinite(diskSettings.sidebarWidth)) {
          setSidebarWidth(diskSettings.sidebarWidth);
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(diskSettings.sidebarWidth));
        }
        if (typeof diskSettings.rememberPassword === "boolean") {
          setRememberPassword(diskSettings.rememberPassword);
          localStorage.setItem(REMEMBER_PASSWORD_KEY, String(diskSettings.rememberPassword));
        }
        if (typeof diskSettings.autoFormat === "boolean") {
          setAutoFormat(diskSettings.autoFormat);
          localStorage.setItem(AUTO_FORMAT_KEY, String(diskSettings.autoFormat));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTO_FORMAT_KEY, String(autoFormat));
    window.oracle?.saveSettings?.({ autoFormat });
  }, [autoFormat]);

  useEffect(() => {
    localStorage.setItem(MAX_ROWS_KEY, String(maxRows));
    window.oracle?.saveSettings?.({ maxRows });
  }, [maxRows]);

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, density);
    window.oracle?.saveSettings?.({ density });
  }, [density]);

  useEffect(() => {
    localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    document.documentElement.style.setProperty(
      "--font-scale",
      String(roundScale(fontScale * 0.75)),
    );
    const currentFontSize = Math.round(EDITOR_BASE_FONT_SIZE * fontScale);
    const currentLineHeight = currentFontSize + 1;
    editorRef.current?.updateOptions({
      fontSize: currentFontSize,
      lineHeight: currentLineHeight,
    });
    setEditorLineHeight(currentLineHeight);
    window.oracle?.saveSettings?.({ fontScale });
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeId);
    applyThemeToDocument(themeId);
    monacoApiRef.current?.editor.setTheme(themeOption(themeId).monacoTheme);
    window.oracle?.saveSettings?.({ theme: themeId });
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem(EDITOR_SPLIT_KEY, String(editorSplit));
    window.oracle?.saveSettings?.({ editorSplit });
  }, [editorSplit]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    window.oracle?.saveSettings?.({ sidebarWidth });
  }, [sidebarWidth]);

  const handleSelectConnection = useCallback(
    (connId: string) => {
      setSelectedConnectionId(connId);
      if (!connId) {
        setConnectionName("");
        setIsProd(false);
        localStorage.removeItem(LAST_CONNECTION_ID_KEY);
        return;
      }
      const match = savedConnections.find((item) => item.id === connId);
      if (match) {
        setConnectionName(match.name);
        setIsProd(!!match.isProd);
        setConfig((prev) => ({
          ...prev,
          user: match.user,
          host: match.host,
          port: match.port,
          service: match.service,
          tcps: !!match.tcps,
        }));
        localStorage.setItem(LAST_CONNECTION_ID_KEY, match.id);
        localStorage.setItem(
          "oracle-ide.connection",
          JSON.stringify({
            user: match.user,
            host: match.host,
            port: match.port,
            service: match.service,
            tcps: !!match.tcps,
          }),
        );
      }
    },
    [savedConnections],
  );

  const handleSaveConnection = useCallback(() => {
    if (!config.user || !config.host || !config.service) return;
    const defaultName = `${config.user}@${config.host}/${config.service}`;
    const nameToSave = connectionName.trim() || defaultName;

    setSavedConnections((prev) => {
      let updated: SavedConnection[];
      const existing = prev.find((item) => item.id === selectedConnectionId);
      let targetId = selectedConnectionId;
      if (existing) {
        updated = prev.map((item) =>
          item.id === selectedConnectionId
            ? {
                ...item,
                name: nameToSave,
                user: config.user,
                host: config.host,
                port: config.port,
                service: config.service,
                tcps: config.tcps,
                isProd,
              }
            : item,
        );
      } else {
        const newConn: SavedConnection = {
          id: crypto.randomUUID(),
          name: nameToSave,
          user: config.user,
          host: config.host,
          port: config.port,
          service: config.service,
          tcps: config.tcps,
          isProd,
        };
        updated = [newConn, ...prev];
        targetId = newConn.id;
        setSelectedConnectionId(newConn.id);
      }
      localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(updated));
      void window.oracle?.saveSavedConnections?.(updated);
      if (targetId) {
        localStorage.setItem(LAST_CONNECTION_ID_KEY, targetId);
      }
      return updated;
    });
    setMessage(`Connection "${nameToSave}" saved`);
  }, [config, connectionName, isProd, selectedConnectionId]);

  const autoConnectAttemptedRef = useRef(false);

  // Synchronize saved connections from disk JSON file on mount & auto-connect to last connection
  useEffect(() => {
    window.oracle?.loadSavedConnections?.<SavedConnection>()
      .then((diskConns) => {
        if (diskConns && Array.isArray(diskConns) && diskConns.length > 0) {
          setSavedConnections(diskConns);
          localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(diskConns));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    if (!savedConnections || savedConnections.length === 0) return;
    autoConnectAttemptedRef.current = true;

    const lastId = localStorage.getItem(LAST_CONNECTION_ID_KEY) || savedConnections[0]?.id;
    const targetConn = savedConnections.find((c) => c.id === lastId) || savedConnections[0];

    if (!targetConn) return;

    (async () => {
      try {
        setSelectedConnectionId(targetConn.id);
        setConnectionName(targetConn.name);
        setIsProd(!!targetConn.isProd);

        const connConfig: ConnectionConfig = {
          user: targetConn.user,
          host: targetConn.host,
          port: targetConn.port,
          service: targetConn.service,
          tcps: !!targetConn.tcps,
          password: "",
        };

        let loadedPass = "";
        if (window.oracle?.loadPassword) {
          loadedPass = (await window.oracle.loadPassword()) || "";
        }
        connConfig.password = loadedPass;
        setConfig(connConfig);

        if (loadedPass) {
          setBusy(true);
          setMessage(`Auto-connecting to ${targetConn.name}...`);

          let hasTimedOut = false;
          const timeoutTimer = window.setTimeout(() => {
            hasTimedOut = true;
            setBusy(false);
            setMessage("Auto-connect timeout (5s)");
          }, 5000);

          const next = await window.oracle.connect(connConfig);
          window.clearTimeout(timeoutTimer);

          if (!hasTimedOut) {
            setStatus(next);
            setObjectsRefresh((n) => n + 1);
            if (targetConn.isProd) {
              setPreProdThemeId(themeId);
              setThemeId("nuclear");
            } else if (themeId === "nuclear") {
              setThemeId("default");
              localStorage.setItem(THEME_KEY, "default");
              applyThemeToDocument("default");
            }
            setMessage(`Auto-connected as ${next.user}@${next.connectString}`);
          }
        } else {
          setMessage(`Restored connection "${targetConn.name}" — enter password to connect`);
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        setMessage(`Auto-connect notice: ${text}`);
      } finally {
        setBusy(false);
      }
    })();
  }, [savedConnections, themeId]);

  const handleDeleteConnection = useCallback(() => {
    if (!selectedConnectionId) return;
    const remaining = savedConnections.filter((item) => item.id !== selectedConnectionId);
    setSavedConnections(remaining);
    localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(remaining));
    void window.oracle?.saveSavedConnections?.(remaining);

    if (remaining.length > 0) {
      handleSelectConnection(remaining[0].id);
    } else {
      setSelectedConnectionId("");
      setConnectionName("");
      setIsProd(false);
      localStorage.removeItem(LAST_CONNECTION_ID_KEY);
    }
    setMessage("Connection profile deleted");
  }, [selectedConnectionId, savedConnections, handleSelectConnection]);

  const updateField = useCallback(
    (field: keyof ConnectionConfig, value: string | boolean) => {
      setConfig((prev) => {
        const next = { ...prev, [field]: value } as ConnectionConfig;
        if (field === "tcps" && value === true && (!prev.port || prev.port === "1521")) {
          next.port = "2484";
        }
        if (field === "tcps" && value === false && prev.port === "2484") {
          next.port = "1521";
        }
        if (field !== "password") {
          localStorage.setItem(
            "oracle-ide.connection",
            JSON.stringify({
              user: next.user,
              host: next.host,
              port: next.port,
              service: next.service,
              tcps: !!next.tcps,
            }),
          );
        } else {
          schedulePasswordSave(String(value));
        }
        return next;
      });
    },
    [schedulePasswordSave],
  );

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setTabs((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const setActiveSql = useCallback(
    (nextSql: string, syncEditor = false) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, sql: nextSql } : tab,
        ),
      );
      if (syncEditor && editorRef.current) {
        const current = editorRef.current.getValue();
        if (current !== nextSql) {
          editorRef.current.setValue(nextSql);
        }
      }
    },
    [activeTabId],
  );

  const pushHistory = useCallback(
    (entrySql: string, ok: boolean, summary: string) => {
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          sql: entrySql,
          ranAt: new Date().toISOString(),
          ok,
          summary,
        },
        ...prev,
      ].slice(0, MAX_HISTORY));
    },
    [],
  );

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    setMessage("Connecting...");

    let hasTimedOut = false;
    const timeoutTimer = setTimeout(() => {
      hasTimedOut = true;
      setBusy(false);
      setError("Connection cancelled: Database server did not respond within 5 seconds");
      setMessage("Connection cancelled (5s timeout)");
    }, 5000);

    try {
      const next = await window.oracle.connect(config);
      if (hasTimedOut) {
        await window.oracle.disconnect().catch(() => {});
        return;
      }
      clearTimeout(timeoutTimer);
      setStatus(next);
      setObjectsRefresh((n) => n + 1);
      if (selectedConnectionId) {
        localStorage.setItem(LAST_CONNECTION_ID_KEY, selectedConnectionId);
      }
      if (isProd) {
        setPreProdThemeId(themeId);
        setThemeId("nuclear");
      } else if (themeId === "nuclear") {
        setThemeId("default");
        localStorage.setItem(THEME_KEY, "default");
        applyThemeToDocument("default");
      }
      setMessage(
        `Connected as ${next.user}@${next.connectString} (${next.mode ?? "thin"})`,
      );
      await persistPassword(config.password, rememberPassword);
    } catch (err) {
      if (!hasTimedOut) {
        clearTimeout(timeoutTimer);
        const errText = err instanceof Error ? err.message : String(err);
        setError(errText);
        setMessage(errText.includes("5 seconds") ? "Connection cancelled (5s timeout)" : "Connection failed");
      }
    } finally {
      clearTimeout(timeoutTimer);
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.oracle.disconnect();
      setStatus(next);
      setPendingEdits({});
      setEditMeta(null);
      if (isProd || themeId === "nuclear") {
        const fallback = preProdThemeId && preProdThemeId !== "nuclear" ? preProdThemeId : "default";
        setThemeId(fallback);
        localStorage.setItem(THEME_KEY, fallback);
        applyThemeToDocument(fallback);
      }
      setMessage("Disconnected");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancelQuery = async () => {
    try {
      setMessage("Cancelling query execution...");
      await window.oracle.cancelQuery();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setError("Query execution cancelled by user");
      setMessage("Query cancelled");
    }
  };

  const resolveExecutableSqlBlock = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    const selection = editor?.getSelection();
    const text = model?.getValue() ?? sql;

    let selectedText = "";
    if (model && selection && !selection.isEmpty()) {
      selectedText = model.getValueInRange(selection);
    }

    const cursorLine = position?.lineNumber ?? 1;
    return statementBlockAtCursor(text, cursorLine, selectedText);
  }, [sql]);

  const executeQueryWithBinds = useCallback(
    async (
      statement: string,
      currentBinds: Record<string, BindVarParam>,
      startLine = 1,
    ) => {
      setBusy(true);
      setQueryStartTime(Date.now());
      setError(null);
      setBottomTab("results");
      setPendingEdits({});
      setEditMeta(null);

      if (editorRef.current && monacoApiRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          monacoApiRef.current.editor.setModelMarkers(model, "oracle-error", []);
        }
      }

      try {
        const { preparedSql, positionalBinds } = prepareSqlWithBinds(
          statement,
          currentBinds,
        );

        const table = detectSingleSourceTable(statement);
        let next: QueryResult;
        let meta: EditMeta | null = null;

        if (table) {
          try {
            const injected = injectRowId(statement);
            const {
              preparedSql: preparedInjected,
              positionalBinds: positionalInjected,
            } = prepareSqlWithBinds(injected, currentBinds);

            next = await window.oracle.execute(
              preparedInjected,
              maxRows,
              positionalInjected,
            );
            const hasRowId = hasRowIdColumn(next.columns);
            let pkColumns: string[] = [];
            if (!hasRowId) {
              pkColumns = await window.oracle.listPrimaryKeys(table);
            }
            meta = {
              table,
              pkColumns,
              editable: hasRowId || pkColumns.length > 0,
            };
          } catch (err) {
            if (isNotConnectedError(err)) throw err;
            next = await window.oracle.execute(
              preparedSql,
              maxRows,
              positionalBinds,
            );
            const pkColumns = next.isSelect
              ? await window.oracle.listPrimaryKeys(table)
              : [];
            meta = {
              table,
              pkColumns,
              editable: next.isSelect && pkColumns.length > 0,
            };
          }
        } else {
          next = await window.oracle.execute(
            preparedSql,
            maxRows,
            positionalBinds,
          );
        }

        setResult(next);
        setEditMeta(next.isSelect ? meta : null);
        let summary: string;
        if (next.isSelect) {
          const note = next.truncated ? " (truncated)" : "";
          const editNote =
            meta?.editable
              ? " · double-click cells to edit"
              : table
                ? " · not editable (need ROWID or PK)"
                : "";
          summary = `${next.rows.length} row${next.rows.length === 1 ? "" : "s"}${note} in ${formatElapsed(next.elapsedMs)}${editNote}`;
        } else {
          summary = `${next.rowsAffected} row${next.rowsAffected === 1 ? "" : "s"} affected in ${formatElapsed(next.elapsedMs)}`;
        }
        setMessage(
          next.isSelect
            ? summary
            : `${summary} — commit or rollback to finish`,
        );
        pushHistory(statement, true, summary);
      } catch (err) {
        let text = err instanceof Error ? err.message : String(err);
        text = text
          .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
          .trim();

        if (isNotConnectedError(err)) {
          await forceDisconnect(text);
        } else {
          const lineMatch = text.match(/at line (\d+)(?:,\s*column (\d+))?/i);
          if (lineMatch) {
            const relLine = Number.parseInt(lineMatch[1], 10);
            const relCol = lineMatch[2] ? Number.parseInt(lineMatch[2], 10) : 1;
            const fileLine = Math.max(1, startLine + (relLine - 1));
            const fileCol = Math.max(1, relCol);

            text = text.replace(
              /at line \d+(?:,\s*column \d+)?/i,
              `at line ${fileLine}, column ${fileCol}`,
            );

            if (editorRef.current && monacoApiRef.current) {
              const model = editorRef.current.getModel();
              if (model) {
                monacoApiRef.current.editor.setModelMarkers(
                  model,
                  "oracle-error",
                  [
                    {
                      startLineNumber: fileLine,
                      startColumn: fileCol,
                      endLineNumber: fileLine,
                      endColumn: Math.max(
                        fileCol + 4,
                        model.getLineMaxColumn(fileLine),
                      ),
                      message: text,
                      severity: monacoApiRef.current.MarkerSeverity.Error,
                    },
                  ],
                );
                editorRef.current.setPosition({
                  lineNumber: fileLine,
                  column: fileCol,
                });
                editorRef.current.revealLineInCenter(fileLine);
              }
            }
          }
          setError(text);
          setMessage("Execute failed");
        }
        pushHistory(statement, false, text.split("\n")[0] ?? "Error");
      } finally {
        setQueryStartTime(null);
        setBusy(false);
      }
    },
    [
      pushHistory,
      maxRows,
      isNotConnectedError,
      forceDisconnect,
      setQueryStartTime,
      setError,
      setBottomTab,
      setPendingEdits,
      setEditMeta,
      setResult,
      setMessage,
    ],
  );

  const executeExplainWithBinds = useCallback(
    async (statement: string, currentBinds: Record<string, BindVarParam>) => {
      setBusy(true);
      setError(null);
      setExplainError(null);
      setBottomTab("explain");
      try {
        const { preparedSql, positionalBinds } = prepareSqlWithBinds(
          statement,
          currentBinds,
        );
        const next = await window.oracle.explain(preparedSql, positionalBinds);
        setExplainResult(next);
        const indexes = next.indexes ?? [];
        const indexSummary =
          indexes.length > 0
            ? `Indexes: ${indexes.join(", ")}`
            : "No indexes used (full table scan or other access path)";
        const summary = `Explain plan · ${next.rows.length} step${next.rows.length === 1 ? "" : "s"} in ${formatElapsed(next.elapsedMs)} · ${indexSummary}`;
        setMessage(summary);
        pushHistory(`EXPLAIN PLAN FOR\n${statement}`, true, summary);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        if (isNotConnectedError(err)) {
          await forceDisconnect(text);
        } else {
          setExplainError(text);
          setError(text);
          setMessage("Explain plan failed");
        }
        pushHistory(`EXPLAIN PLAN FOR\n${statement}`, false, text.split("\n")[0] ?? "Error");
      } finally {
        setBusy(false);
      }
    },
    [
      pushHistory,
      isNotConnectedError,
      forceDisconnect,
      setError,
      setExplainError,
      setBottomTab,
      setExplainResult,
      setMessage,
    ],
  );

  const onExecute = useCallback(async () => {
    if (!status.connected) {
      setError("Connect to Oracle first");
      return;
    }

    if (autoFormat) {
      onFormatSqlRef.current();
    }

    const { statement, startLine } = resolveExecutableSqlBlock();
    if (!statement) {
      setError("No statement under the cursor (separate statements with a blank line)");
      setMessage("Nothing to run");
      return;
    }

    const detectedBinds = parseBindVariables(statement);
    if (detectedBinds.length > 0) {
      setBindModalState({
        open: true,
        varNames: detectedBinds,
        action: "execute",
        rawSql: statement,
      });
      return;
    }

    await executeQueryWithBinds(statement, bindValues, startLine);
  }, [
    status.connected,
    resolveExecutableSqlBlock,
    bindValues,
    executeQueryWithBinds,
    setError,
    setMessage,
  ]);

  const handleExplainTabClick = useCallback(
    (targetQueryIdx?: number) => {
      setBottomTab("explain");
      if (!status.connected) {
        setExplainError("Connect to Oracle database first");
        return;
      }
      const blocks = parseSqlStatements(sql);
      if (blocks.length === 0) {
        setExplainError("No SQL statement in editor to explain");
        return;
      }

      let chosenIdx = 0;
      if (typeof targetQueryIdx === "number" && targetQueryIdx >= 0 && targetQueryIdx < blocks.length) {
        chosenIdx = targetQueryIdx;
      } else if (blocks.length > 1) {
        const currentBlock = resolveExecutableSqlBlock();
        const matchIdx = blocks.findIndex((b) => b.startLine === currentBlock.startLine);
        chosenIdx = matchIdx >= 0 ? matchIdx : 0;
      }

      setSelectedExplainQueryIndex(chosenIdx);
      const targetBlock = blocks[chosenIdx];
      const detectedBinds = parseBindVariables(targetBlock.text);
      if (detectedBinds.length > 0) {
        setBindModalState({
          open: true,
          varNames: detectedBinds,
          action: "explain",
          rawSql: targetBlock.text,
        });
        return;
      }
      void executeExplainWithBinds(targetBlock.text, bindValues);
    },
    [
      status.connected,
      sql,
      resolveExecutableSqlBlock,
      executeExplainWithBinds,
      bindValues,
    ],
  );

  const onConfirmBindModal = async (confirmedBinds: Record<string, BindVarParam>) => {
    if (!bindModalState) return;

    setBindValues((prev) => ({
      ...prev,
      ...confirmedBinds,
    }));

    const { action, rawSql } = bindModalState;
    setBindModalState(null);

    const mergedBinds = { ...bindValues, ...confirmedBinds };

    if (action === "execute") {
      await executeQueryWithBinds(rawSql, mergedBinds);
    } else {
      await executeExplainWithBinds(rawSql, mergedBinds);
    }
  };

  const onFormatSql = useCallback(() => {
    if (!editorRef.current) {
      if (sql) {
        const formatted = formatSql(sql);
        setActiveSql(formatted);
      }
      return;
    }

    const selection = editorRef.current.getSelection();
    const model = editorRef.current.getModel();
    const selectedText = model && selection ? model.getValueInRange(selection) : "";

    if (selectedText && selectedText.trim()) {
      const formatted = formatSql(selectedText);
      editorRef.current.executeEdits("format-sql", [
        {
          range: selection!,
          text: formatted,
          forceMoveMarkers: true,
        },
      ]);
      setActiveSql(editorRef.current.getValue());
    } else {
      const currentFullSql = editorRef.current.getValue();
      if (!currentFullSql || !currentFullSql.trim()) return;
      const formatted = formatSql(currentFullSql);
      editorRef.current.setValue(formatted);
      setActiveSql(formatted);
    }
  }, [sql, setActiveSql]);

  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  const onFormatSqlRef = useRef(onFormatSql);
  onFormatSqlRef.current = onFormatSql;

  const onEditorBeforeMount: BeforeMount = useCallback((monaco) => {
    monacoApiRef.current = monaco;
    monaco.editor.defineTheme("datastuff-default", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6B7A90" },
        { token: "keyword", foreground: "3D8BFD" },
        { token: "number", foreground: "3DD68C" },
        { token: "string", foreground: "C084FC" },
        { token: "string.sql", foreground: "C084FC" },
        { token: "string.escape", foreground: "D8B4FE" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#E8EAED",
        "editorLineNumber.foreground": "#5A6578",
        "editorLineNumber.activeForeground": "#9AA3B2",
        "editorCursor.foreground": "#3D8BFD",
        "editor.selectionBackground": "#3D8BFD44",
        "editor.lineHighlightBackground": "#22262E88",
        "editorIndentGuide.background": "#323843",
        "editorIndentGuide.activeBackground": "#445064",
        "editorWidget.background": "#1E2229",
        "editorWidget.border": "#323843",
      },
    });
    monaco.editor.defineTheme("datastuff-brass", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "string", foreground: "D4B56E" },
        { token: "string.sql", foreground: "D4B56E" },
        { token: "string.escape", foreground: "E8D5A3" },
        { token: "comment", foreground: "7A7168" },
        { token: "keyword", foreground: "C4A35A" },
        { token: "number", foreground: "6FAF8A" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#F0EBE3",
        "editorLineNumber.foreground": "#5A5348",
        "editorLineNumber.activeForeground": "#A89F92",
        "editorCursor.foreground": "#C4A35A",
        "editor.selectionBackground": "#3A334466",
        "editor.lineHighlightBackground": "#1C182288",
        "editorIndentGuide.background": "#2A2433",
        "editorIndentGuide.activeBackground": "#3A3344",
        "editorWidget.background": "#1A1620",
        "editorWidget.border": "#2A2433",
      },
    });
    monaco.editor.defineTheme("datastuff-spaceship", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "475569" },
        { token: "keyword", foreground: "38bdf8" },
        { token: "number", foreground: "34d399" },
        { token: "string", foreground: "c084fc" },
        { token: "string.sql", foreground: "c084fc" },
        { token: "string.escape", foreground: "e879f9" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f8fafc",
        "editorLineNumber.foreground": "#334155",
        "editorLineNumber.activeForeground": "#94a3b8",
        "editorCursor.foreground": "#38bdf8",
        "editor.selectionBackground": "#38bdf833",
        "editor.lineHighlightBackground": "#0f172a88",
        "editorIndentGuide.background": "#1e293b",
        "editorIndentGuide.activeBackground": "#38bdf855",
        "editorWidget.background": "#0b1329",
        "editorWidget.border": "#1e293b",
      },
    });
    monaco.editor.defineTheme("datastuff-aetherium", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "64748b" },
        { token: "keyword", foreground: "818cf8" },
        { token: "number", foreground: "38bdf8" },
        { token: "string", foreground: "e879f9" },
        { token: "string.sql", foreground: "e879f9" },
        { token: "string.escape", foreground: "f472b6" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f1f5f9",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#818cf8",
        "editorCursor.foreground": "#818cf8",
        "editor.selectionBackground": "#818cf833",
        "editor.lineHighlightBackground": "#1e1b4b88",
        "editorIndentGuide.background": "#312e81",
        "editorIndentGuide.activeBackground": "#818cf855",
        "editorWidget.background": "#1e1b4b",
        "editorWidget.border": "#312e81",
      },
    });
    monaco.editor.defineTheme("datastuff-racecar", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "71717a" },
        { token: "keyword", foreground: "ef4444" },
        { token: "number", foreground: "f59e0b" },
        { token: "string", foreground: "38bdf8" },
        { token: "string.sql", foreground: "38bdf8" },
        { token: "string.escape", foreground: "60a5fa" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fafafa",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#ef4444",
        "editorCursor.foreground": "#ef4444",
        "editor.selectionBackground": "#ef444433",
        "editor.lineHighlightBackground": "#27272a88",
        "editorIndentGuide.background": "#3f3f46",
        "editorIndentGuide.activeBackground": "#ef444455",
        "editorWidget.background": "#18181b",
        "editorWidget.border": "#27272a",
      },
    });
    monaco.editor.defineTheme("datastuff-lava", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "78350f" },
        { token: "keyword", foreground: "f97316" },
        { token: "number", foreground: "eab308" },
        { token: "string", foreground: "ef4444" },
        { token: "string.sql", foreground: "ef4444" },
        { token: "string.escape", foreground: "f87171" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fff7ed",
        "editorLineNumber.foreground": "#7c2d12",
        "editorLineNumber.activeForeground": "#f97316",
        "editorCursor.foreground": "#f97316",
        "editor.selectionBackground": "#f9731633",
        "editor.lineHighlightBackground": "#451a0388",
        "editorIndentGuide.background": "#7c2d12",
        "editorIndentGuide.activeBackground": "#f9731655",
        "editorWidget.background": "#290f04",
        "editorWidget.border": "#451a03",
      },
    });
    monaco.editor.defineTheme("datastuff-ice", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "475569" },
        { token: "keyword", foreground: "38bdf8" },
        { token: "number", foreground: "34d399" },
        { token: "string", foreground: "818cf8" },
        { token: "string.sql", foreground: "818cf8" },
        { token: "string.escape", foreground: "a5b4fc" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f0f9ff",
        "editorLineNumber.foreground": "#334155",
        "editorLineNumber.activeForeground": "#38bdf8",
        "editorCursor.foreground": "#38bdf8",
        "editor.selectionBackground": "#38bdf833",
        "editor.lineHighlightBackground": "#13233888",
        "editorIndentGuide.background": "#1e293b",
        "editorIndentGuide.activeBackground": "#38bdf855",
        "editorWidget.background": "#0f172a",
        "editorWidget.border": "#1e293b",
      },
    });
    monaco.editor.defineTheme("datastuff-nuclear", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "991B1B" },
        { token: "keyword", foreground: "EF4444" },
        { token: "number", foreground: "F59E0B" },
        { token: "string", foreground: "F87171" },
        { token: "string.sql", foreground: "F87171" },
        { token: "string.escape", foreground: "FCA5A5" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#FEF2F2",
        "editorLineNumber.foreground": "#7F1D1D",
        "editorLineNumber.activeForeground": "#EF4444",
        "editorCursor.foreground": "#EF4444",
        "editor.selectionBackground": "#EF444444",
        "editor.lineHighlightBackground": "#290D0988",
        "editorIndentGuide.background": "#38120D",
        "editorIndentGuide.activeBackground": "#EF444466",
        "editorWidget.background": "#170705f0",
        "editorWidget.border": "#38120D",
      },
    });
    monaco.editor.defineTheme("datastuff-matrix", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "15803d" },
        { token: "keyword", foreground: "00ff66" },
        { token: "number", foreground: "a7f3d0" },
        { token: "string", foreground: "34d399" },
        { token: "string.sql", foreground: "34d399" },
        { token: "string.escape", foreground: "6ee7b7" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f0fdf4",
        "editorLineNumber.foreground": "166534",
        "editorLineNumber.activeForeground": "#00ff66",
        "editorCursor.foreground": "#00ff66",
        "editor.selectionBackground": "#00ff6633",
        "editor.lineHighlightBackground": "#052e1688",
        "editorIndentGuide.background": "#14532d",
        "editorIndentGuide.activeBackground": "#00ff6655",
        "editorWidget.background": "#052e16",
        "editorWidget.border": "#15803d",
      },
    });
    monaco.editor.defineTheme("datastuff-deepsea", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "475569" },
        { token: "keyword", foreground: "06b6d4" },
        { token: "number", foreground: "c084fc" },
        { token: "string", foreground: "38bdf8" },
        { token: "string.sql", foreground: "38bdf8" },
        { token: "string.escape", foreground: "a5b4fc" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#ecfeff",
        "editorLineNumber.foreground": "#164e63",
        "editorLineNumber.activeForeground": "#06b6d4",
        "editorCursor.foreground": "#06b6d4",
        "editor.selectionBackground": "#06b6d433",
        "editor.lineHighlightBackground": "#08334488",
        "editorIndentGuide.background": "#155e75",
        "editorIndentGuide.activeBackground": "#06b6d455",
        "editorWidget.background": "#083344",
        "editorWidget.border": "#155e75",
      },
    });
    monaco.editor.defineTheme("datastuff-synthwave", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6b21a8" },
        { token: "keyword", foreground: "ec4899" },
        { token: "number", foreground: "f97316" },
        { token: "string", foreground: "06b6d4" },
        { token: "string.sql", foreground: "06b6d4" },
        { token: "string.escape", foreground: "a855f7" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fdf2f8",
        "editorLineNumber.foreground": "#831843",
        "editorLineNumber.activeForeground": "#ec4899",
        "editorCursor.foreground": "#ec4899",
        "editor.selectionBackground": "#ec489933",
        "editor.lineHighlightBackground": "#50072488",
        "editorIndentGuide.background": "#9d174d",
        "editorIndentGuide.activeBackground": "#ec489955",
        "editorWidget.background": "#500724",
        "editorWidget.border": "#9d174d",
      },
    });
    monaco.editor.defineTheme("datastuff-enchanted", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "064e3b" },
        { token: "keyword", foreground: "f59e0b" },
        { token: "number", foreground: "34d399" },
        { token: "string", foreground: "fbbf24" },
        { token: "string.sql", foreground: "fbbf24" },
        { token: "string.escape", foreground: "fcd34d" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fef3c7",
        "editorLineNumber.foreground": "#78350f",
        "editorLineNumber.activeForeground": "#f59e0b",
        "editorCursor.foreground": "#f59e0b",
        "editor.selectionBackground": "#f59e0b33",
        "editor.lineHighlightBackground": "#451a0388",
        "editorIndentGuide.background": "#78350f",
        "editorIndentGuide.activeBackground": "#f59e0b55",
        "editorWidget.background": "#291e0a",
        "editorWidget.border": "#78350f",
      },
    });
    monaco.editor.defineTheme("datastuff-hud", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "78350f" },
        { token: "keyword", foreground: "fbbf24" },
        { token: "number", foreground: "22c55e" },
        { token: "string", foreground: "f59e0b" },
        { token: "string.sql", foreground: "f59e0b" },
        { token: "string.escape", foreground: "ef4444" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fffbeb",
        "editorLineNumber.foreground": "#451a03",
        "editorLineNumber.activeForeground": "#fbbf24",
        "editorCursor.foreground": "#fbbf24",
        "editor.selectionBackground": "#fbbf2433",
        "editor.lineHighlightBackground": "#290d0988",
        "editorIndentGuide.background": "#78350f",
        "editorIndentGuide.activeBackground": "#fbbf2455",
        "editorWidget.background": "#1c1006",
        "editorWidget.border": "#78350f",
      },
    });
    monaco.editor.defineTheme("datastuff-dragon", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "7f1d1d" },
        { token: "keyword", foreground: "dc2626" },
        { token: "number", foreground: "f59e0b" },
        { token: "string", foreground: "f97316" },
        { token: "string.sql", foreground: "f97316" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fef2f2",
        "editorLineNumber.foreground": "#7f1d1d",
        "editorLineNumber.activeForeground": "#dc2626",
        "editorCursor.foreground": "#dc2626",
        "editor.selectionBackground": "#dc262633",
        "editor.lineHighlightBackground": "#450a0a88",
        "editorIndentGuide.background": "#7f1d1d",
        "editorIndentGuide.activeBackground": "#dc262655",
        "editorWidget.background": "#1c0a0a",
        "editorWidget.border": "#7f1d1d",
      },
    });
    monaco.editor.defineTheme("datastuff-nebula", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "581c87" },
        { token: "keyword", foreground: "a855f7" },
        { token: "number", foreground: "06b6d4" },
        { token: "string", foreground: "ec4899" },
        { token: "string.sql", foreground: "ec4899" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#faf5ff",
        "editorLineNumber.foreground": "#581c87",
        "editorLineNumber.activeForeground": "#a855f7",
        "editorCursor.foreground": "#a855f7",
        "editor.selectionBackground": "#a855f733",
        "editor.lineHighlightBackground": "#3b076488",
        "editorIndentGuide.background": "#581c87",
        "editorIndentGuide.activeBackground": "#a855f755",
        "editorWidget.background": "#2e1065",
        "editorWidget.border": "#581c87",
      },
    });
    monaco.editor.defineTheme("datastuff-sakura", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "831843" },
        { token: "keyword", foreground: "f472b6" },
        { token: "number", foreground: "fde047" },
        { token: "string", foreground: "fb7185" },
        { token: "string.sql", foreground: "fb7185" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fdf2f8",
        "editorLineNumber.foreground": "#831843",
        "editorLineNumber.activeForeground": "#f472b6",
        "editorCursor.foreground": "#f472b6",
        "editor.selectionBackground": "#f472b633",
        "editor.lineHighlightBackground": "#50072488",
        "editorIndentGuide.background": "#831843",
        "editorIndentGuide.activeBackground": "#f472b655",
        "editorWidget.background": "#3b0764",
        "editorWidget.border": "#831843",
      },
    });
    monaco.editor.defineTheme("datastuff-lightning", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "1e3a8a" },
        { token: "keyword", foreground: "38bdf8" },
        { token: "number", foreground: "facc15" },
        { token: "string", foreground: "22d3ee" },
        { token: "string.sql", foreground: "22d3ee" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f0f9ff",
        "editorLineNumber.foreground": "#1e3a8a",
        "editorLineNumber.activeForeground": "#38bdf8",
        "editorCursor.foreground": "#38bdf8",
        "editor.selectionBackground": "#38bdf833",
        "editor.lineHighlightBackground": "#17255488",
        "editorIndentGuide.background": "#1e3a8a",
        "editorIndentGuide.activeBackground": "#38bdf855",
        "editorWidget.background": "#0f172a",
        "editorWidget.border": "#1e3a8a",
      },
    });
    monaco.editor.defineTheme("datastuff-drift", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "7f1d1d" },
        { token: "keyword", foreground: "ef4444" },
        { token: "number", foreground: "f59e0b" },
        { token: "string", foreground: "f8fafc" },
        { token: "string.sql", foreground: "f8fafc" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#f8fafc",
        "editorLineNumber.foreground": "#7f1d1d",
        "editorLineNumber.activeForeground": "#ef4444",
        "editorCursor.foreground": "#ef4444",
        "editor.selectionBackground": "#ef444433",
        "editor.lineHighlightBackground": "#450a0a88",
        "editorIndentGuide.background": "#7f1d1d",
        "editorIndentGuide.activeBackground": "#ef444455",
        "editorWidget.background": "#0f172a",
        "editorWidget.border": "#7f1d1d",
      },
    });
    monaco.editor.defineTheme("datastuff-codex", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "78350f" },
        { token: "keyword", foreground: "d97706" },
        { token: "number", foreground: "fde047" },
        { token: "string", foreground: "fbbf24" },
        { token: "string.sql", foreground: "fbbf24" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fef08a",
        "editorLineNumber.foreground": "#78350f",
        "editorLineNumber.activeForeground": "#d97706",
        "editorCursor.foreground": "#d97706",
        "editor.selectionBackground": "#d9770633",
        "editor.lineHighlightBackground": "#451a0388",
        "editorIndentGuide.background": "#78350f",
        "editorIndentGuide.activeBackground": "#d9770655",
        "editorWidget.background": "#291e0a",
        "editorWidget.border": "#78350f",
      },
    });
    monaco.editor.defineTheme("datastuff-dune", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "7c2d12" },
        { token: "keyword", foreground: "f97316" },
        { token: "number", foreground: "eab308" },
        { token: "string", foreground: "fb7185" },
        { token: "string.sql", foreground: "fb7185" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fff7ed",
        "editorLineNumber.foreground": "#7c2d12",
        "editorLineNumber.activeForeground": "#f97316",
        "editorCursor.foreground": "#f97316",
        "editor.selectionBackground": "#f9731633",
        "editor.lineHighlightBackground": "#43140788",
        "editorIndentGuide.background": "#7c2d12",
        "editorIndentGuide.activeBackground": "#f9731655",
        "editorWidget.background": "#1c0a0a",
        "editorWidget.border": "#7c2d12",
      },
    });
    monaco.editor.defineTheme("datastuff-crystal", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "581c87" },
        { token: "keyword", foreground: "9333ea" },
        { token: "number", foreground: "14b8a6" },
        { token: "string", foreground: "f472b6" },
        { token: "string.sql", foreground: "f472b6" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#faf5ff",
        "editorLineNumber.foreground": "#581c87",
        "editorLineNumber.activeForeground": "#9333ea",
        "editorCursor.foreground": "#9333ea",
        "editor.selectionBackground": "#9333ea33",
        "editor.lineHighlightBackground": "#3b076488",
        "editorIndentGuide.background": "#581c87",
        "editorIndentGuide.activeBackground": "#9333ea55",
        "editorWidget.background": "#1e1b4b",
        "editorWidget.border": "#581c87",
      },
    });
    monaco.editor.defineTheme("datastuff-cyberpunk", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "831843" },
        { token: "keyword", foreground: "00ffcc" },
        { token: "number", foreground: "facc15" },
        { token: "string", foreground: "be185d" },
        { token: "string.sql", foreground: "be185d" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#ecfeff",
        "editorLineNumber.foreground": "#831843",
        "editorLineNumber.activeForeground": "#00ffcc",
        "editorCursor.foreground": "#00ffcc",
        "editor.selectionBackground": "#00ffcc33",
        "editor.lineHighlightBackground": "#50072488",
        "editorIndentGuide.background": "#831843",
        "editorIndentGuide.activeBackground": "#00ffcc55",
        "editorWidget.background": "#030712",
        "editorWidget.border": "#be185d",
      },
    });
    monaco.editor.defineTheme("datastuff-solar", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "7f1d1d" },
        { token: "keyword", foreground: "fef08a" },
        { token: "number", foreground: "fbbf24" },
        { token: "string", foreground: "f97316" },
        { token: "string.sql", foreground: "f97316" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.foreground": "#fffbeb",
        "editorLineNumber.foreground": "#7f1d1d",
        "editorLineNumber.activeForeground": "#fef08a",
        "editorCursor.foreground": "#fef08a",
        "editor.selectionBackground": "#fef08a33",
        "editor.lineHighlightBackground": "#450a0a88",
        "editorIndentGuide.background": "#7f1d1d",
        "editorIndentGuide.activeBackground": "#fef08a55",
        "editorWidget.background": "#290d09",
        "editorWidget.border": "#7f1d1d",
      },
    });
  }, []);

  const onEditorMount: OnMount = useCallback((ed, monaco) => {
    editorRef.current = ed;
    monaco.editor.setTheme(themeOption(themeId).monacoTheme);
    const currentFontSize = Math.round(EDITOR_BASE_FONT_SIZE * loadFontScale());
    const currentLineHeight = currentFontSize + 1;
    ed.updateOptions({
      fontSize: currentFontSize,
      lineHeight: currentLineHeight,
    });

    setEditorLineHeight(currentLineHeight);
    setEditorScrollTop(ed.getScrollTop());
    setEditorTick((t) => t + 1);

    const refreshGutter = () => {
      setEditorScrollTop(ed.getScrollTop());
      setEditorTick((t) => t + 1);
    };

    ed.onDidScrollChange((e) => {
      setEditorScrollTop(e.scrollTop);
      setEditorTick((t) => t + 1);
    });

    ed.onDidChangeModelContent(() => {
      refreshGutter();
    });

    ed.onDidLayoutChange(() => {
      refreshGutter();
    });

    ed.onDidChangeModel(() => {
      refreshGutter();
    });

    const runStatement = () => {
      void onExecuteRef.current();
    };

    ed.addAction({
      id: "oracle-ide.run-statement",
      label: "Run Statement at Cursor",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      ],
      run: runStatement,
    });

    ed.addAction({
      id: "oracle-ide.format-sql",
      label: "Format SQL Query",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      ],
      run: () => {
        onFormatSqlRef.current();
      },
    });

    // addCommand overrides the default Shift+Enter binding (needs editContext: false).
    ed.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, runStatement);

    // Belt-and-suspenders: Native EditContext inserts newlines via beforeinput
    // (insertLineBreak / insertParagraph), which bypasses keybindings entirely.
    const dom = ed.getDomNode();
    const onBeforeInput = (event: Event) => {
      if (!(event instanceof InputEvent)) return;
      if (
        event.inputType !== "insertLineBreak" &&
        event.inputType !== "insertParagraph"
      ) {
        return;
      }
      // Only Shift+Enter — plain Enter must still insert a newline.
      if ((event as unknown as { getModifierState?: (k: string) => boolean }).getModifierState?.("Shift") !== true) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runStatement();
    };
    dom?.addEventListener("beforeinput", onBeforeInput, true);
  }, []);

  const bumpFontScale = (delta: number) => {
    setFontScale((prev) =>
      roundScale(
        Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, prev + delta)),
      ),
    );
  };

  const endSplitDrag = useCallback(() => {
    if (!splitDragRef.current) return;
    splitDragRef.current = null;
    document.body.classList.remove("is-row-resizing");
  }, []);

  const endSidebarDrag = useCallback(() => {
    if (!sidebarDragRef.current) return;
    sidebarDragRef.current = null;
    document.body.classList.remove("is-col-resizing");
  }, []);

  const onSidebarPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      sidebarDragRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      document.body.classList.add("is-col-resizing");
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [sidebarWidth],
  );

  const onSidebarPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = sidebarDragRef.current;
      if (!drag) return;
      const next = drag.startWidth - (event.clientX - drag.startX);
      setSidebarWidth(
        Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, next)),
      );
    },
    [],
  );

  const onSidebarPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (sidebarDragRef.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
      }
      endSidebarDrag();
    },
    [endSidebarDrag],
  );
  const tabsDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(QUERY_TABS_WIDTH_KEY, String(queryTabsWidth));
    window.oracle?.saveSettings?.({ queryTabsWidth });
  }, [queryTabsWidth]);

  const endTabsDrag = useCallback(() => {
    tabsDragRef.current = null;
    document.body.classList.remove("is-col-resizing");
  }, []);

  const onTabsPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      tabsDragRef.current = {
        startX: event.clientX,
        startWidth: queryTabsWidth,
      };
      document.body.classList.add("is-col-resizing");
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [queryTabsWidth],
  );

  const onTabsPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = tabsDragRef.current;
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      const next = Math.min(
        MAX_QUERY_TABS_WIDTH,
        Math.max(MIN_QUERY_TABS_WIDTH, drag.startWidth + delta),
      );
      setQueryTabsWidth(next);
    },
    [],
  );

  const onTabsPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (tabsDragRef.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
      }
      endTabsDrag();
    },
    [endTabsDrag],
  );

  const onSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const available = Math.max(
        200,
        workspace.getBoundingClientRect().height - WORKSPACE_FIXED_CHROME_PX,
      );
      splitDragRef.current = {
        startY: event.clientY,
        startSplit: editorSplit,
        available,
      };
      document.body.classList.add("is-row-resizing");
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [editorSplit],
  );

  const onSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = splitDragRef.current;
      if (!drag) return;
      const next =
        drag.startSplit + (event.clientY - drag.startY) / drag.available;
      setEditorSplit(
        Math.min(MAX_EDITOR_SPLIT, Math.max(MIN_EDITOR_SPLIT, next)),
      );
    },
    [],
  );

  const onSplitPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (splitDragRef.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
      }
      endSplitDrag();
    },
    [endSplitDrag],
  );

  const onCellEdit = useCallback((edit: CellEdit) => {
    const key = cellEditKey(edit.rowIndex, edit.columnIndex);
    setPendingEdits((prev) => {
      const next = { ...prev };
      if (cellValuesEqual(edit.newValue, edit.oldValue)) {
        delete next[key];
      } else {
        next[key] = edit;
      }
      return next;
    });
  }, []);

  const applyPendingUpdates = async () => {
    if (!result || !editMeta?.editable) return 0;
    const edits = Object.values(pendingEdits);
    if (edits.length === 0) return 0;

    const rowIdIndex = result.columns.findIndex((col: { name: string }) => isRowIdColumn(col.name));
    const pkIndexes = editMeta.pkColumns.map((name: string) => {
      const index = result.columns.findIndex(
        (col: { name: string }) => col.name.replace(/^"+|"+$/g, "").toUpperCase() === name.toUpperCase(),
      );
      if (index < 0) {
        throw new Error(`Primary key column ${name} not in result set`);
      }
      return { name, index };
    });

    for (const edit of edits as CellEdit[]) {
      const row = result.rows[edit.rowIndex];
      if (!row) throw new Error(`Missing row ${edit.rowIndex + 1}`);

      const rowId =
        rowIdIndex >= 0 && row[rowIdIndex] != null
          ? String(row[rowIdIndex])
          : undefined;
      const pkColumns =
        !rowId && pkIndexes.length > 0
          ? pkIndexes.map(({ name, index }: { name: string; index: number }) => ({
              name,
              value: row[index],
            }))
          : undefined;

      const colMeta = result.columns.find(
        (c: { name: string; type?: string }) => c.name.replace(/^"+|"+$/g, "").toUpperCase() === edit.columnName.replace(/^"+|"+$/g, "").toUpperCase(),
      );

      const { sql, binds } = buildUpdate(
        editMeta.table,
        edit.columnName,
        edit.newValue,
        rowId,
        pkColumns,
        colMeta?.type,
      );
      await window.oracle.execute(sql, maxRows, binds);
    }
    return edits.length;
  };

  const executeCommit = async () => {
    setShowProdCommitConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const editCount = await applyPendingUpdates();
      await window.oracle.commit();
      if (editCount > 0 && result) {
        setResult((prev) => {
          if (!prev) return prev;
          const rows = prev.rows.map((row) => [...row]);
          for (const edit of Object.values(pendingEdits) as CellEdit[]) {
            rows[edit.rowIndex][edit.columnIndex] = edit.newValue;
          }
          return { ...prev, rows };
        });
        setPendingEdits({});
        setMessage(
          `Applied ${editCount} cell update${editCount === 1 ? "" : "s"} and committed`,
        );
      } else {
        setMessage("Transaction committed");
      }
    } catch (err) {
      if (isNotConnectedError(err)) {
        await forceDisconnect(
          err instanceof Error ? err.message : String(err),
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setMessage("Commit failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const onCommit = async () => {
    if (isProd) {
      setShowProdCommitConfirm(true);
    } else {
      await executeCommit();
    }
  };

  const onRollback = async () => {
    setBusy(true);
    setError(null);
    try {
      const discarded = Object.keys(pendingEdits).length;
      setPendingEdits({});
      await window.oracle.rollback();
      setMessage(
        discarded > 0
          ? `Rolled back · discarded ${discarded} unsaved cell edit${discarded === 1 ? "" : "s"}`
          : "Transaction rolled back",
      );
    } catch (err) {
      if (isNotConnectedError(err)) {
        await forceDisconnect(
          err instanceof Error ? err.message : String(err),
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const onExportCsv = async () => {
    if (!result?.isSelect || result.columns.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const csv = resultToCsv(resultWithoutRowId(result));
      const saved = await window.oracle.saveCsv(csv, "query-results.csv");
      if (saved.saved) {
        setMessage(`Exported CSV to ${saved.filePath}`);
      } else {
        setMessage("CSV export cancelled");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addTab = useCallback(async (sqlText = "", title = "query") => {
    try {
      const tab = await window.oracle.createSqlPage(title, sqlText);
      skipNextSaveRef.current = true;
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      setSaveState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openTabs = useCallback(async () => {
    try {
      const result = await window.oracle.openSqlPages();
      if (!result.opened || result.tabs.length === 0) return;
      skipNextSaveRef.current = true;
      setTabs((prev) => {
        const byId = new Map(prev.map((tab) => [tab.id, tab]));
        for (const tab of result.tabs) {
          byId.set(tab.id, tab);
        }
        const existingIds = new Set(prev.map((tab) => tab.id));
        const merged = prev.map((tab) => byId.get(tab.id)!);
        for (const tab of result.tabs) {
          if (!existingIds.has(tab.id)) merged.push(tab);
        }
        return merged;
      });
      const last = result.tabs[result.tabs.length - 1];
      setActiveTabId(last.id);
      setSaveState("saved");
      setMessage(
        result.tabs.length === 1
          ? `Opened ${last.fileName}`
          : `Opened ${result.tabs.length} SQL files`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const closeTab = async (id: string) => {
    const tab = tabs.find((entry) => entry.id === id);
    if (!tab) return;
    const index = tabs.findIndex((entry) => entry.id === id);
    const next = tabs.filter((entry) => entry.id !== id);
    const nextActive =
      activeTabId === id
        ? (next[Math.max(0, index - 1)] ?? next[0])?.id ?? ""
        : activeTabId;
    try {
      await window.oracle.closeSqlPage(tab.fileName);
      // Keep refs in sync before any save — otherwise persistWorkspace would
      // write the closed tab back from the stale tabsRef.
      skipNextSaveRef.current = true;
      tabsRef.current = next;
      activeTabIdRef.current = nextActive;
      setTabs(next);
      setActiveTabId(nextActive);
      await persistWorkspace(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameTab = async (id: string, title: string) => {
    const tab = tabs.find((entry) => entry.id === id);
    if (!tab) return;
    try {
      await persistWorkspace(true);
      const renamed = await window.oracle.renameSqlPage(tab.fileName, title);
      skipNextSaveRef.current = true;
      setTabs((prev) =>
        prev.map((entry) => (entry.id === id || entry.fileName === tab.fileName ? renamed : entry)),
      );
      if (activeTabId === id || activeTabId === tab.fileName) {
        setActiveTabId(renamed.id);
      }
      setSaveState("saved");
      setMessage(`Renamed to ${renamed.fileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openSelectForObject = (objectName: string) => {
    const statement = `SELECT * FROM ${objectName}\n`;
    void addTab(statement, objectName);
  };

  const insertObjectName = (objectName: string) => {
    const current = editorRef.current?.getValue() ?? sql;
    const prefix = current.endsWith("\n") || current.length === 0 ? "" : "\n";
    setActiveSql(`${current}${prefix}${objectName}`, true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Monaco handles Ctrl/Cmd+Enter and Shift+Enter inside the editor; this covers focus elsewhere.
      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey || event.shiftKey) &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement | null;
        const inMonaco = target?.closest?.(".monaco-editor");
        if (inMonaco) return;
        // Don't steal Shift+Enter from inputs (e.g. rename / connection fields).
        if (
          event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        void onExecute();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void addTab();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openTabs();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExecute, addTab, openTabs]);

  const pendingEditCount = Object.keys(pendingEdits).length;

  const resultSummary = useMemo(() => {
    if (!result) return "No results yet";
    if (result.isSelect) {
      const cols = visibleColumnCount(result);
      const dirty =
        pendingEditCount > 0
          ? ` · ${pendingEditCount} unsaved edit${pendingEditCount === 1 ? "" : "s"}`
          : "";
      return `${result.rows.length} rows · ${cols} columns · ${formatElapsed(result.elapsedMs)}${dirty}`;
    }
    return `${result.rowsAffected} rows affected · ${formatElapsed(result.elapsedMs)}`;
  }, [result, pendingEditCount]);

  const explainSummary = useMemo(() => {
    if (!explainResult) return "No explain plan yet";
    const indexes = explainResult.indexes ?? [];
    const indexNote =
      indexes.length > 0
        ? ` · Indexes: ${indexes.join(", ")}`
        : " · No indexes used";
    return `${explainResult.rows.length} step${explainResult.rows.length === 1 ? "" : "s"} · ${formatElapsed(explainResult.elapsedMs)}${indexNote}`;
  }, [explainResult]);

  const explainCellTitle = useCallback(
    (
      rowIndex: number,
      _columnIndex: number,
      columnName: string,
      value: unknown,
      text: string,
    ) => {
      if (!explainResult || columnName.toUpperCase() !== "OBJECT_NAME") {
        return undefined;
      }
      if (value == null || text === "" || text === "NULL") return undefined;
      const row = explainResult.rows[rowIndex];
      if (!row) return undefined;
      const typeIdx = explainResult.columns.findIndex(
        (c: { name: string }) => c.name.toUpperCase() === "OBJECT_TYPE",
      );
      const opIdx = explainResult.columns.findIndex(
        (c: { name: string }) => c.name.toUpperCase() === "OPERATION",
      );
      const ownerIdx = explainResult.columns.findIndex(
        (c: { name: string }) => c.name.toUpperCase() === "OBJECT_OWNER",
      );
      const objectType = typeIdx >= 0 ? String(row[typeIdx] ?? "") : "";
      const operation = opIdx >= 0 ? String(row[opIdx] ?? "") : "";
      if (
        !/INDEX/i.test(objectType) &&
        !/INDEX/i.test(operation)
      ) {
        return undefined;
      }
      const owner = ownerIdx >= 0 ? String(row[ownerIdx] ?? "").trim() : "";
      const bare = String(value).trim();
      const qualified = owner ? `${owner}.${bare}` : bare;
      const defs = explainResult.indexDefinitions ?? {};
      return (
        defs[qualified] ??
        defs[bare] ??
        defs[qualified.toUpperCase()] ??
        defs[bare.toUpperCase()] ??
        undefined
      );
    },
    [explainResult],
  );

  const canExport =
    !!result?.isSelect && result.columns.length > 0;
  const gridEditable = !!editMeta?.editable;

  return (
    <div className="app">
      {themeId === "default" ? <DefaultAtmosphere /> : null}
      {themeId === "aetherium" ? <AetheriumAtmosphere /> : null}
      {themeId === "brass" ? <BrassAtmosphere /> : null}
      {themeId === "spaceship" ? (
        <div className="theme-atmosphere spaceship-atmosphere" aria-hidden="true">
          {/* Large Deep-Space 3D Spiral Galaxy (300+ Individual Star Particles) */}
          <div className="spiral-galaxy-container">
            <svg className="spiral-galaxy-svg" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet">
              <defs>
                {/* Galactic Core Bright White/Yellow Nucleus */}
                <radialGradient id="galaxy-core-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="20%" stopColor="#fef08a" stopOpacity="0.9" />
                  <stop offset="45%" stopColor="#f472b6" stopOpacity="0.65" />
                  <stop offset="75%" stopColor="#c084fc" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>

                <filter id="galaxy-core-blur" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="16" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="star-glare-filter" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Central Nucleus Core Glow */}
              <circle cx="400" cy="400" r="160" fill="url(#galaxy-core-glow)" filter="url(#galaxy-core-blur)" />

              {/* 300+ Individual Star Particles tracing logarithmic spiral arms */}
              <g className="galaxy-stars-group">
                {galaxyStars.map((star, idx) => (
                  <circle
                    key={idx}
                    cx={star.cx}
                    cy={star.cy}
                    r={star.r}
                    fill={star.fill}
                    opacity={star.opacity}
                    className={star.animationClass}
                    filter={star.r > 3.2 ? "url(#star-glare-filter)" : undefined}
                  />
                ))}
              </g>
            </svg>
          </div>

          {/* Procedurally Generated Celestial Bodies (Randomized Placement, Types, Colors & Random Directional Movement) */}
          {spacePlanets.map((planet) => (
            <div
              key={planet.id}
              className={`space-celestial space-celestial-dynamic celestial-${planet.type}`}
              style={{
                left: `${planet.xPct}vw`,
                top: `${planet.yPct}vh`,
                width: `${planet.size}px`,
                height: `${planet.size}px`,
                animationDuration: `${planet.duration}s`,
                animationDelay: `${planet.delay}s`,
                "--move-x": planet.moveX,
                "--move-y": planet.moveY,
                "--move-rot": `${planet.moveRot}deg`,
                "--start-scale": planet.startScale,
                "--end-scale": planet.endScale,
              } as React.CSSProperties}
              title={`Planet ${planet.name}`}
            >
              {/* RINGS BACK */}
              {planet.rings?.map((ring, rIdx) => (
                <span
                  key={`ring-back-${rIdx}`}
                  className="planet-ring-system ring-back"
                  style={{
                    width: `${ring.sizePx}px`,
                    height: `${ring.sizePx}px`,
                    border: ring.borderStyle,
                    boxShadow: ring.boxShadow,
                    transform: `translate(-50%, -50%) rotateX(${ring.tiltX}deg) rotateY(${ring.tiltY}deg) rotateZ(${ring.tiltZ}deg)`,
                    animation: ring.spinDuration ? `debris-ring-spin ${ring.spinDuration}s linear infinite` : undefined,
                  }}
                />
              ))}

              {/* ATMOSPHERE HALO */}
              <span
                className="planet-atmosphere-halo"
                style={{
                  background: planet.haloBackground,
                  filter: `blur(${planet.haloBlur}px)`,
                }}
              />

              {/* PLANET SPHERE BODY */}
              <span
                className="planet-sphere-body"
                style={{
                  background: planet.bodyGradient,
                  boxShadow: planet.bodyShadow,
                }}
              />

              {/* SURFACE TEXTURE & ATMOSPHERIC EFFECTS */}
              {planet.textureClass && <span className={`planet-surface-texture ${planet.textureClass}`} />}
              {planet.cloudStyle && <span className="planet-cloud-bands" style={planet.cloudStyle} />}
              {planet.auroraStyle && <span className="planet-aurora-boreal" style={planet.auroraStyle} />}
              {planet.spotStyle && <span className="planet-great-spot" style={planet.spotStyle} />}

              {/* RINGS FRONT */}
              {planet.rings?.map((ring, rIdx) => (
                <span
                  key={`ring-front-${rIdx}`}
                  className="planet-ring-system ring-front"
                  style={{
                    width: `${ring.sizePx}px`,
                    height: `${ring.sizePx}px`,
                    border: ring.borderStyle,
                    boxShadow: ring.boxShadow,
                    transform: `translate(-50%, -50%) rotateX(${ring.tiltX}deg) rotateY(${ring.tiltY}deg) rotateZ(${ring.tiltZ}deg)`,
                    animation: ring.spinDuration ? `debris-ring-spin ${ring.spinDuration}s linear infinite` : undefined,
                  }}
                />
              ))}

              {/* ORBITING MOONS */}
              {planet.moons?.map((moon, mIdx) => (
                <div
                  key={`moon-${mIdx}`}
                  className="orbiting-moon"
                  style={{
                    width: `${moon.size}px`,
                    height: `${moon.size}px`,
                    background: moon.gradient,
                    boxShadow: moon.glow,
                    top: `${moon.topPct}%`,
                    left: `${moon.leftPct}%`,
                    animation: `moon-dynamic-orbit ${moon.orbitDuration}s ease-in-out infinite alternate`,
                    animationDelay: `${moon.orbitDelay}s`,
                    "--moon-start-x": `${moon.startX}px`,
                    "--moon-start-y": `${moon.startY}px`,
                    "--moon-end-x": `${moon.endX}px`,
                    "--moon-end-y": `${moon.endY}px`,
                    "--moon-start-scale": moon.startScale,
                    "--moon-end-scale": moon.endScale,
                  } as React.CSSProperties}
                >
                  <span className="moon-shadow" />
                </div>
              ))}
            </div>
          ))}
          <span className="shooting-star shooting-star-1" />
          <span className="shooting-star shooting-star-2" />
          {/* Ship 1: Astral Dreadnought Flagship */}
          <div className="distant-ship distant-ship-1 ship-astral-dreadnought">
            <svg className="starship-svg" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="dreadnought-hull" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="35%" stopColor="#334155" />
                  <stop offset="70%" stopColor="#64748b" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
              </defs>
              <polygon points="0,28 40,32 0,36" fill="#38bdf8" opacity="0.95" />
              <polygon points="0,44 40,48 0,52" fill="#38bdf8" opacity="0.95" />
              <polygon points="35,40 60,20 180,24 230,40 180,56 60,60" fill="url(#dreadnought-hull)" stroke="#cbd5e1" strokeWidth="1.5" />
              <ellipse cx="90" cy="40" rx="14" ry="26" fill="none" stroke="#38bdf8" strokeWidth="4" />
              <ellipse cx="90" cy="40" rx="8" ry="18" fill="none" stroke="#f1f5f9" strokeWidth="2" />
              <polygon points="120,40 140,28 175,32 165,40" fill="#f8fafc" stroke="#38bdf8" strokeWidth="1" />
              <polygon points="120,40 140,52 175,48 165,40" fill="#cbd5e1" stroke="#38bdf8" strokeWidth="1" />
              <rect x="100" y="34" width="24" height="12" rx="2" fill="#0284c7" opacity="0.8" />
              <polygon points="140,16 170,8 180,22" fill="#475569" stroke="#67e8f9" strokeWidth="1" />
              <polygon points="140,64 170,72 180,58" fill="#475569" stroke="#67e8f9" strokeWidth="1" />
              <circle cx="228" cy="40" r="3" fill="#ffffff" />
            </svg>
          </div>

          {/* Ship 2: Quantum Interceptor Starfighter */}
          <div className="distant-ship distant-ship-2 ship-quantum-interceptor">
            <svg className="starship-svg" viewBox="0 0 220 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="interceptor-hull" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1e1b4b" />
                  <stop offset="50%" stopColor="#4338ca" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
              <polygon points="0,32 45,36 0,40" fill="#c084fc" opacity="0.95" />
              <polygon points="0,40 45,44 0,48" fill="#f472b6" opacity="0.95" />
              <polygon points="40,40 100,10 210,40 100,70" fill="url(#interceptor-hull)" stroke="#c7d2fe" strokeWidth="1.5" />
              <line x1="210" y1="36" x2="220" y2="34" stroke="#a5b4fc" strokeWidth="3" />
              <line x1="210" y1="44" x2="220" y2="46" stroke="#a5b4fc" strokeWidth="3" />
              <polygon points="120,40 160,32 185,40 160,48" fill="#e0e7ff" stroke="#38bdf8" strokeWidth="1.5" />
              <polygon points="90,12 140,2 150,18" fill="#312e81" stroke="#818cf8" strokeWidth="1" />
              <polygon points="90,68 140,78 150,62" fill="#312e81" stroke="#818cf8" strokeWidth="1" />
            </svg>
          </div>

          {/* Ship 3: Solar Corvette */}
          <div className="distant-ship distant-ship-3 ship-solar-corvette">
            <svg className="starship-svg" viewBox="0 0 210 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="corvette-gold" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#78350f" />
                  <stop offset="50%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#fef08a" />
                </linearGradient>
              </defs>
              <polygon points="0,35 50,40 0,45" fill="#f59e0b" opacity="0.95" />
              <rect x="40" y="14" width="140" height="14" rx="7" fill="#451a03" stroke="#fbbf24" strokeWidth="1.5" />
              <rect x="40" y="52" width="140" height="14" rx="7" fill="#451a03" stroke="#fbbf24" strokeWidth="1.5" />
              <rect x="90" y="24" width="20" height="32" fill="#92400e" stroke="#d97706" strokeWidth="1" />
              <rect x="140" y="24" width="20" height="32" fill="#92400e" stroke="#d97706" strokeWidth="1" />
              <ellipse cx="120" cy="40" rx="35" ry="18" fill="url(#corvette-gold)" stroke="#ffffff" strokeWidth="1.5" />
              <ellipse cx="135" cy="40" rx="15" ry="8" fill="#ffffff" />
              <polygon points="90,14 110,0 130,14" fill="#fef08a" opacity="0.85" />
              <polygon points="90,66 110,80 130,66" fill="#fef08a" opacity="0.85" />
            </svg>
          </div>

          {/* Ship 4: Void Harvester Mining Dreadnought */}
          <div className="distant-ship distant-ship-4 ship-void-harvester">
            <svg className="starship-svg" viewBox="0 0 220 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="harvester-hull" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1c1917" />
                  <stop offset="50%" stopColor="#44403c" />
                  <stop offset="100%" stopColor="#78716c" />
                </linearGradient>
              </defs>
              <polygon points="0,32 40,36 0,40" fill="#f97316" opacity="0.95" />
              <polygon points="0,40 40,44 0,48" fill="#f97316" opacity="0.95" />
              <polygon points="70,40 90,20 160,20 180,40 160,60 90,60" fill="url(#harvester-hull)" stroke="#ea580c" strokeWidth="1.5" />
              <polygon points="160,24 210,12 185,34" fill="#292524" stroke="#f97316" strokeWidth="1.5" />
              <polygon points="160,56 210,68 185,46" fill="#292524" stroke="#f97316" strokeWidth="1.5" />
              <line x1="205" y1="14" x2="205" y2="66" stroke="#fde047" strokeWidth="2.5" />
              <rect x="100" y="26" width="22" height="12" rx="3" fill="#ea580c" />
              <rect x="130" y="26" width="22" height="12" rx="3" fill="#ea580c" />
              <rect x="100" y="42" width="22" height="12" rx="3" fill="#ea580c" />
              <rect x="130" y="42" width="22" height="12" rx="3" fill="#ea580c" />
            </svg>
          </div>

          {/* Ship 5: Chrono Battlecruiser */}
          <div className="distant-ship distant-ship-5 ship-chrono-battlecruiser">
            <svg className="starship-svg" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="battlecruiser-blue" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="50%" stopColor="#0369a1" />
                  <stop offset="100%" stopColor="#e0f2fe" />
                </linearGradient>
              </defs>
              <polygon points="0,30 45,35 0,40" fill="#38bdf8" opacity="0.95" />
              <polygon points="0,40 45,45 0,50" fill="#38bdf8" opacity="0.95" />
              <polygon points="40,40 80,18 200,22 235,40 200,58 80,62" fill="url(#battlecruiser-blue)" stroke="#bae6fd" strokeWidth="1.5" />
              <polygon points="230,40 240,40 235,37 235,43" fill="#ffffff" />
              <ellipse cx="140" cy="22" rx="12" ry="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
              <line x1="140" y1="22" x2="140" y2="10" stroke="#38bdf8" strokeWidth="2" />
              <rect x="150" y="34" width="30" height="12" rx="2" fill="#ffffff" />
            </svg>
          </div>

          {/* Ship 6: Apex Stealth Corvette */}
          <div className="distant-ship distant-ship-6 ship-apex-corvette">
            <svg className="starship-svg" viewBox="0 0 210 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="stealth-dark" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#09090b" />
                  <stop offset="50%" stopColor="#27272a" />
                  <stop offset="100%" stopColor="#52525b" />
                </linearGradient>
              </defs>
              <polygon points="0,34 40,38 0,42" fill="#a855f7" opacity="0.95" />
              <polygon points="35,40 90,8 200,40 90,72" fill="url(#stealth-dark)" stroke="#e4e4e7" strokeWidth="1.5" />
              <line x1="90" y1="8" x2="200" y2="40" stroke="#c084fc" strokeWidth="1.5" />
              <line x1="90" y1="72" x2="200" y2="40" stroke="#c084fc" strokeWidth="1.5" />
              <rect x="100" y="30" width="4" height="20" fill="#a855f7" />
              <rect x="110" y="30" width="4" height="20" fill="#a855f7" />
              <rect x="120" y="30" width="4" height="20" fill="#a855f7" />
            </svg>
          </div>

          {/* Ship 7: Titan Carrier */}
          <div className="distant-ship distant-ship-7 ship-titan-carrier">
            <svg className="starship-svg" viewBox="0 0 250 90" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="carrier-steel" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="50%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
              </defs>
              <polygon points="0,32 45,37 0,42" fill="#34d399" opacity="0.95" />
              <polygon points="0,48 45,53 0,58" fill="#34d399" opacity="0.95" />
              <polygon points="40,45 70,20 235,25 245,45 235,65 70,70" fill="url(#carrier-steel)" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="80" y1="32" x2="220" y2="35" stroke="#34d399" strokeWidth="2" strokeDasharray="8 6" />
              <line x1="80" y1="58" x2="220" y2="55" stroke="#34d399" strokeWidth="2" strokeDasharray="8 6" />
              <rect x="110" y="40" width="30" height="10" fill="#020617" stroke="#34d399" strokeWidth="1" />
              <rect x="160" y="40" width="30" height="10" fill="#020617" stroke="#34d399" strokeWidth="1" />
              <rect x="130" y="12" width="40" height="15" rx="3" fill="#f8fafc" stroke="#34d399" strokeWidth="1.5" />
              <line x1="150" y1="12" x2="150" y2="4" stroke="#34d399" strokeWidth="2" />
              <circle cx="150" cy="4" r="3" fill="#34d399" />
            </svg>
          </div>
        </div>
      ) : null}
      {themeId === "racecar" ? (
        <div
          className="racecar-atmosphere"
          style={{ "--circuit-path": `path("${raceTrackPath}")` } as React.CSSProperties}
        >
          <div className="track-3d-stage">
            <div className="track-loop-container">
              <svg className="gp-circuit-svg" viewBox="0 0 1600 900" preserveAspectRatio="none">
                {/* 1. Gravel Safety Runoff Perimeter */}
                <path className="gp-track-runoff" d={raceTrackPath} />
                {/* 2. Red & White Racing Curbs (Apex Rumble Strips) */}
                <path className="gp-track-curbs-red" d={raceTrackPath} />
                <path className="gp-track-curbs-white" d={raceTrackPath} />
                {/* 3. Main Dark Asphalt Surface */}
                <path className="gp-track-asphalt" d={raceTrackPath} />
                {/* 4. Rubbered Racing Line Overlay */}
                <path className="gp-track-racingline" d={raceTrackPath} />
                {/* 5. Outer Track Boundary White Lines */}
                <path className="gp-track-boundary" d={raceTrackPath} />
                {/* 6. Yellow Dashed Center Line */}
                <path className="gp-track-centerline" d={raceTrackPath} />
              </svg>

              {/* Race Car 1: Red Scuderia F1 Supercar */}
              <div className="race-car race-car-1 car-f1-red">
                <span className="rc-underglow" />
                <span className="rc-headlight-beam" />
                <span className="rc-chassis" />
                <span className="rc-racing-stripe" />
                <span className="rc-livery-number">01</span>
                <span className="rc-nose" />
                <span className="rc-wing-front" />
                <span className="rc-wing-rear" />
                <span className="rc-cockpit" />
                <span className="rc-halo-bar" />
                <span className="rc-driver-helmet" />
                <span className="rc-pod-left" />
                <span className="rc-pod-right" />
                <span className="rc-wheel wheel-fl" />
                <span className="rc-wheel wheel-fr" />
                <span className="rc-wheel wheel-rl" />
                <span className="rc-wheel wheel-rr" />
                <span className="rc-taillights" />
                <span className="rc-exhaust-glow" />
              </div>

              {/* Race Car 2: Electric Cyan Endurance GT3 */}
              <div className="race-car race-car-2 car-gt-cyan">
                <span className="rc-underglow" />
                <span className="rc-headlight-beam" />
                <span className="rc-chassis" />
                <span className="rc-racing-stripe" />
                <span className="rc-livery-number">24</span>
                <span className="rc-roof" />
                <span className="rc-windshield" />
                <span className="rc-spoiler" />
                <span className="rc-diffuser" />
                <span className="rc-wheel wheel-fl" />
                <span className="rc-wheel wheel-fr" />
                <span className="rc-wheel wheel-rl" />
                <span className="rc-wheel wheel-rr" />
                <span className="rc-headlights" />
                <span className="rc-taillights" />
              </div>

              {/* Race Car 3: Solar Gold Hypercar */}
              <div className="race-car race-car-3 car-hyper-gold">
                <span className="rc-underglow" />
                <span className="rc-headlight-beam" />
                <span className="rc-chassis" />
                <span className="rc-racing-stripe" />
                <span className="rc-livery-number">77</span>
                <span className="rc-fin" />
                <span className="rc-canopy" />
                <span className="rc-side-air-intake-left" />
                <span className="rc-side-air-intake-right" />
                <span className="rc-wing-rear" />
                <span className="rc-wheel wheel-fl" />
                <span className="rc-wheel wheel-fr" />
                <span className="rc-wheel wheel-rl" />
                <span className="rc-wheel wheel-rr" />
                <span className="rc-exhaust-glow" />
              </div>

              {/* Race Car 4: Emerald Green Prototype */}
              <div className="race-car race-car-4 car-proto-green">
                <span className="rc-underglow" />
                <span className="rc-headlight-beam" />
                <span className="rc-chassis" />
                <span className="rc-racing-stripe" />
                <span className="rc-livery-number">09</span>
                <span className="rc-fender-left" />
                <span className="rc-fender-right" />
                <span className="rc-cockpit" />
                <span className="rc-wheel wheel-fl" />
                <span className="rc-wheel wheel-fr" />
                <span className="rc-wheel wheel-rl" />
                <span className="rc-wheel wheel-rr" />
                <span className="rc-headlights" />
                <span className="rc-taillights" />
              </div>

              {/* Race Car 5: Midnight Purple Speedster */}
              <div className="race-car race-car-5 car-drift-purple">
                <span className="rc-underglow" />
                <span className="rc-headlight-beam" />
                <span className="rc-chassis" />
                <span className="rc-racing-stripe" />
                <span className="rc-livery-number">88</span>
                <span className="rc-widebody" />
                <span className="rc-ducktail" />
                <span className="rc-windshield" />
                <span className="rc-wheel wheel-fl" />
                <span className="rc-wheel wheel-fr" />
                <span className="rc-wheel wheel-rl" />
                <span className="rc-wheel wheel-rr" />
                <span className="rc-exhaust-glow" />
                <span className="rc-taillights" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {themeId === "lava" ? (
        <div className="lava-atmosphere">
          {/* Horizon Radiant Magma Glow */}
          <div className="lava-bottom-glow" />

          {/* Molten Lava Basins & Magma Flows */}
          <div className="lava-magma-pool pool-1" />
          <div className="lava-magma-pool pool-2" />
          <div className="lava-river river-left" />
          <div className="lava-river river-right" />
          <div className="lava-crust-cracks" />

          {/* Rolling Viscous Liquid Magma Surges Along Floor */}
          <div className="lava-magma-surge surge-1">
            <span className="magma-core" />
            <span className="magma-crest crest-1" />
            <span className="magma-crest crest-2" />
          </div>
          <div className="lava-magma-surge surge-2">
            <span className="magma-core" />
            <span className="magma-crest crest-2" />
            <span className="magma-crest crest-3" />
          </div>
          <div className="lava-magma-surge surge-3">
            <span className="magma-core" />
            <span className="magma-crest crest-1" />
            <span className="magma-crest crest-3" />
          </div>
          <div className="lava-magma-surge surge-4">
            <span className="magma-core" />
            <span className="magma-crest crest-2" />
          </div>

          {/* Magma Spatter & Erupting Liquid Splashes */}
          <div className="lava-spatter-plume plume-1" />
          <div className="lava-spatter-plume plume-2" />
          <div className="lava-spatter-plume plume-3" />

          {/* Magma Bubbles & Eruptions */}
          <div className="lava-bubble bubble-1" />
          <div className="lava-bubble bubble-2" />
          <div className="lava-bubble bubble-3" />
          <div className="lava-bubble bubble-4" />

          <div className="lava-ember ember-1" />
          <div className="lava-ember ember-2" />
          <div className="lava-ember ember-3" />
          <div className="lava-ember ember-4" />
          <div className="lava-ember ember-5" />
          <div className="lava-ember ember-6" />
          <div className="lava-ember ember-7" />
          <div className="lava-ember ember-8" />
        </div>
      ) : null}
      {themeId === "nuclear" ? (
        <div className="nuclear-atmosphere">
          {/* Silo Reinforced Steel Hangar & Blast Doors */}
          <div className="silo-blast-hatch left-hatch" />
          <div className="silo-blast-hatch right-hatch" />
          <div className="silo-hazard-stripe top-stripe" />
          <div className="silo-hazard-stripe bottom-stripe" />

          {/* Radiation Trefoil Emblem & Status Lights */}
          <div className="radiation-trefoil">
            <span className="trefoil-center" />
            <span className="trefoil-blade blade-1" />
            <span className="trefoil-blade blade-2" />
            <span className="trefoil-blade blade-3" />
          </div>

          {/* Rotating Warning Strobe Lights & Beacon Sweeps */}
          <div className="warning-beacon beacon-left" />
          <div className="warning-beacon beacon-right" />
          <div className="nuclear-status-banner">DEFCON 1 · PRODUCTION LIVE DATABASE SILO</div>

          {/* Steam Vents & Geiger Spark Particles */}
          <div className="steam-vent vent-left" />
          <div className="steam-vent vent-right" />
          <div className="radiation-particle spark-1" />
          <div className="radiation-particle spark-2" />
          <div className="radiation-particle spark-3" />
          <div className="radiation-particle spark-4" />
        </div>
      ) : null}
      {themeId === "ice" ? (
        <div className="ice-atmosphere">
          {/* Backlight Horizon Ambient & Sunburst Glow */}
          <div className="ice-backlight-horizon" />
          <div className="ice-sun-halo" />

          {/* Master 3D Layered SVG Ice Cave Roof & Stalactite Curtain */}
          <svg className="ice-cave-svg" viewBox="0 0 1920 700" preserveAspectRatio="none">
            <defs>
              {/* Far Background Ice Gradient */}
              <linearGradient id="ice-far-body" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#0284c7" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.1" />
              </linearGradient>

              {/* Mid-Distance Ice Gradient */}
              <linearGradient id="ice-mid-body" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="20%" stopColor="#e0f2fe" stopOpacity="0.75" />
                <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
              </linearGradient>

              {/* Foreground Crystal Clear Ice Gradient */}
              <linearGradient id="ice-fore-body" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="15%" stopColor="#f0f9ff" stopOpacity="0.9" />
                <stop offset="45%" stopColor="#7dd3fc" stopOpacity="0.75" />
                <stop offset="80%" stopColor="#0284c7" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.2" />
              </linearGradient>

              {/* Sunlit Golden Crest Rim Gradient */}
              <linearGradient id="sunlit-ice-rim" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
                <stop offset="20%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="50%" stopColor="#e0f2fe" stopOpacity="0.95" />
                <stop offset="80%" stopColor="#fef08a" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.98" />
              </linearGradient>

              {/* Spine Specular Highlight Gradient */}
              <linearGradient id="specular-spine-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="40%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="75%" stopColor="#bae6fd" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>

              <filter id="bg-depth-blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" />
              </filter>

              <filter id="ice-glow-heavy" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="heavy-3d-drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="4" dy="12" stdDeviation="12" floodColor="#0284c7" floodOpacity="0.7" />
                <feDropShadow dx="-2" dy="6" stdDeviation="6" floodColor="#0369a1" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* TIER 1: Far Background Miniature Ice Needle Grid */}
            <path
              className="ice-layer-far-back"
              fill="url(#ice-far-body)"
              filter="url(#bg-depth-blur)"
              opacity="0.35"
              d="M 0,0 L 1920,0 L 1920,40 
                 Q 1910,90 1900,160 Q 1890,90 1880,45
                 Q 1860,110 1850,190 Q 1840,110 1820,40
                 Q 1800,130 1790,210 Q 1780,130 1760,45
                 Q 1740,100 1730,170 Q 1720,100 1700,40
                 Q 1680,120 1670,200 Q 1660,120 1640,45
                 Q 1620,90 1610,150 Q 1600,90 1580,40
                 Q 1560,140 1550,220 Q 1540,140 1520,45
                 Q 1500,100 1490,180 Q 1480,100 1460,40
                 Q 1440,130 1430,210 Q 1420,130 1400,45
                 Q 1380,90 1370,160 Q 1360,90 1340,40
                 Q 1320,120 1310,195 Q 1300,120 1280,45
                 Q 1260,100 1250,170 Q 1240,100 1220,40
                 Q 1200,140 1190,230 Q 1180,140 1160,45
                 Q 1140,90 1130,160 Q 1120,90 1100,40
                 Q 1080,120 1070,200 Q 1060,120 1040,45
                 Q 1020,100 1010,170 Q 1000,100 980,40
                 Q 960,130 950,220 Q 940,130 920,45
                 Q 900,90 890,160 Q 880,90 860,40
                 Q 840,120 830,200 Q 820,120 800,45
                 Q 780,100 770,170 Q 760,100 740,40
                 Q 720,130 710,210 Q 700,130 680,45
                 Q 660,90 650,160 Q 640,90 620,40
                 Q 600,120 590,195 Q 580,120 560,45
                 Q 540,100 530,170 Q 520,100 500,40
                 Q 480,140 470,230 Q 460,140 440,45
                 Q 420,90 410,160 Q 400,90 380,40
                 Q 360,120 350,200 Q 340,120 320,45
                 Q 300,100 290,170 Q 280,100 260,40
                 Q 240,130 230,210 Q 220,130 200,45
                 Q 180,90 170,160 Q 160,90 140,40
                 Q 120,120 110,190 Q 100,120 80,45
                 Q 60,90 50,150 Q 40,90 0,40 Z"
            />

            {/* TIER 2: Mid-Distance Secondary Stalactite Fringe */}
            <path
              className="ice-layer-back"
              fill="url(#ice-mid-body)"
              opacity="0.6"
              d="M 0,0 L 1920,0 L 1920,60 
                 Q 1900,120 1890,210 Q 1880,120 1860,70 
                 Q 1840,160 1830,270 Q 1820,160 1800,65
                 Q 1780,190 1770,310 Q 1760,190 1740,75
                 Q 1720,140 1710,210 Q 1700,140 1680,60
                 Q 1660,170 1650,290 Q 1640,170 1620,70
                 Q 1600,150 1590,240 Q 1580,150 1560,65
                 Q 1540,200 1530,340 Q 1520,200 1500,80
                 Q 1480,140 1470,220 Q 1460,140 1440,60
                 Q 1420,180 1410,300 Q 1400,180 1380,75
                 Q 1360,130 1350,200 Q 1340,130 1320,65
                 Q 1300,190 1290,320 Q 1280,190 1260,70
                 Q 1240,150 1230,230 Q 1220,150 1200,60
                 Q 1180,200 1170,350 Q 1160,200 1140,80
                 Q 1120,140 1110,210 Q 1100,140 1080,65
                 Q 1060,170 1050,290 Q 1040,170 1020,70
                 Q 1000,160 990,250 Q 980,160 960,60
                 Q 940,210 930,360 Q 920,210 900,75
                 Q 880,140 870,210 Q 860,140 840,65
                 Q 820,180 810,310 Q 800,180 780,70
                 Q 760,150 750,240 Q 740,150 720,60
                 Q 700,200 690,330 Q 680,200 660,75
                 Q 640,140 630,210 Q 620,140 600,65
                 Q 580,170 570,280 Q 560,170 540,70
                 Q 520,150 510,230 Q 500,150 480,60
                 Q 460,210 450,350 Q 440,210 420,80
                 Q 400,140 390,210 Q 380,140 360,65
                 Q 340,180 330,300 Q 320,180 300,70
                 Q 280,150 270,240 Q 260,150 240,60
                 Q 220,200 210,340 Q 200,200 180,75
                 Q 160,140 150,210 Q 140,140 120,65
                 Q 100,170 90,280 Q 80,170 60,70
                 Q 40,130 30,200 Q 20,130 0,60 Z"
            />

            {/* TIER 3: Primary Foreground Mammoth Stalactites with Heavy 3D Drop Shadow */}
            <path
              className="ice-layer-fore"
              fill="url(#ice-fore-body)"
              filter="url(#heavy-3d-drop-shadow)"
              d="M 0,0 L 1920,0 L 1920,80
                 C 1900,95 1880,160 1870,280 C 1865,340 1860,400 1855,400 C 1850,400 1845,340 1840,280 C 1830,160 1810,95 1790,80
                 C 1775,90 1760,140 1750,220 C 1745,260 1740,310 1736,310 C 1732,310 1728,260 1722,220 C 1712,140 1695,90 1680,80
                 C 1660,100 1640,180 1630,340 C 1622,420 1615,500 1610,500 C 1605,500 1598,420 1590,340 C 1580,180 1560,100 1540,80
                 C 1525,92 1510,140 1500,230 C 1495,275 1490,320 1486,320 C 1482,320 1478,275 1472,230 C 1462,140 1445,92 1430,80
                 C 1410,105 1390,190 1380,380 C 1373,450 1366,520 1360,520 C 1354,520 1347,450 1340,380 C 1330,190 1310,105 1290,80
                 C 1275,90 1260,135 1250,210 C 1245,250 1240,290 1236,290 C 1232,290 1228,250 1222,210 C 1212,135 1195,90 1180,80
                 C 1160,100 1140,170 1130,330 C 1123,400 1116,480 1110,480 C 1104,480 1097,400 1090,330 C 1080,170 1060,100 1040,80
                 C 1025,92 1010,145 1000,240 C 995,290 990,340 986,340 C 982,340 978,290 972,240 C 962,145 945,92 930,80
                 C 910,110 890,200 880,410 C 872,490 865,560 860,560 C 855,560 848,490 840,410 C 830,200 810,110 790,80
                 C 775,90 760,140 750,220 C 745,260 740,300 736,300 C 732,300 728,260 722,220 C 712,140 695,90 680,80
                 C 660,100 640,175 630,350 C 622,430 615,510 610,510 C 605,510 598,430 590,350 C 580,175 560,100 540,80
                 C 525,92 510,140 500,230 C 495,275 490,320 486,320 C 482,320 478,275 472,230 C 462,140 445,92 430,80
                 C 410,105 390,190 380,390 C 373,460 366,540 360,540 C 354,540 347,460 340,390 C 330,190 310,105 290,80
                 C 275,90 260,140 250,220 C 245,260 240,300 236,300 C 232,300 228,260 222,220 C 212,140 195,90 180,80
                 C 160,100 140,175 130,350 C 122,430 115,490 110,490 C 105,490 98,430 90,350 C 80,175 60,100 40,80
                 C 25,88 12,120 0,160 L 0,0 Z"
            />

            {/* TIER 4: 3D Refraction Facet Highlights & Shadow Overlays */}
            <g className="ice-3d-facets">
              {/* Highlight facets on left flank of stalactite shafts */}
              <path fill="rgba(255, 255, 255, 0.45)" d="M 1855,100 L 1855,400 L 1845,280 L 1840,160 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 1610,100 L 1610,500 L 1598,340 L 1590,180 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 1360,100 L 1360,520 L 1347,380 L 1340,190 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 1110,100 L 1110,480 L 1097,330 L 1090,170 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 860,100 L 860,560 L 848,410 L 840,200 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 610,100 L 610,510 L 598,350 L 590,175 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 360,100 L 360,540 L 347,390 L 340,190 Z" />
              <path fill="rgba(255, 255, 255, 0.45)" d="M 110,100 L 110,490 L 98,350 L 90,175 Z" />

              {/* Shadow refraction facets on right flank of stalactite shafts */}
              <path fill="rgba(2, 132, 199, 0.35)" d="M 1855,100 L 1855,400 L 1865,340 L 1870,280 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 1610,100 L 1610,500 L 1622,420 L 1630,340 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 1360,100 L 1360,520 L 1373,450 L 1380,380 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 1110,100 L 1110,480 L 1123,400 L 1130,330 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 860,100 L 860,560 L 872,490 L 880,410 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 610,100 L 610,510 L 622,430 L 630,350 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 360,100 L 360,540 L 373,460 L 380,390 Z" />
              <path fill="rgba(2, 132, 199, 0.35)" d="M 110,100 L 110,490 L 122,430 L 130,350 Z" />
            </g>

            {/* TIER 5: 3D Horizontal Freeze-Thaw Rib Rings & Specular Central Spines */}
            <g className="ice-3d-rib-rings" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="2.5" fill="none">
              <path d="M 1845,180 Q 1855,190 1865,180" />
              <path d="M 1848,270 Q 1855,280 1862,270" />
              <path d="M 1600,200 Q 1610,210 1620,200" />
              <path d="M 1603,320 Q 1610,330 1617,320" />
              <path d="M 1350,220 Q 1360,230 1370,220" />
              <path d="M 1353,360 Q 1360,370 1367,360" />
              <path d="M 1100,200 Q 1110,210 1120,200" />
              <path d="M 1103,320 Q 1110,330 1117,320" />
              <path d="M 850,230 Q 860,240 870,230" />
              <path d="M 853,380 Q 860,390 867,380" />
              <path d="M 600,210 Q 610,220 620,210" />
              <path d="M 603,340 Q 610,350 617,340" />
              <path d="M 350,220 Q 360,230 370,220" />
              <path d="M 353,370 Q 360,380 367,370" />
              <path d="M 100,210 Q 110,220 120,210" />
              <path d="M 103,330 Q 110,340 117,330" />
            </g>

            {/* Specular Central Ridge Spine Paths */}
            <g className="ice-specular-spines" stroke="url(#specular-spine-grad)" strokeWidth="5" strokeLinecap="round" opacity="0.95">
              <path d="M 1855,100 L 1855,395" />
              <path d="M 1736,95 L 1736,305" />
              <path d="M 1610,100 L 1610,495" />
              <path d="M 1486,95 L 1486,315" />
              <path d="M 1360,100 L 1360,515" />
              <path d="M 1236,95 L 1236,285" />
              <path d="M 1110,100 L 1110,475" />
              <path d="M 986,95 L 986,335" />
              <path d="M 860,100 L 860,555" />
              <path d="M 736,95 L 736,295" />
              <path d="M 610,100 L 610,505" />
              <path d="M 486,95 L 486,315" />
              <path d="M 360,100 L 360,535" />
              <path d="M 236,95 L 236,295" />
              <path d="M 110,100 L 110,485" />
            </g>

            {/* TIER 6: Golden Sunlight Top Edge Crest (Front Rim) */}
            <path
              className="sunlit-ice-crest"
              fill="url(#sunlit-ice-rim)"
              filter="url(#ice-glow-heavy)"
              d="M 0,0 L 1920,0 L 1920,38 Q 960,58 0,38 Z"
            />
          </svg>

          {/* Animated Water Drips Falling From Stalactite Tips */}
          <div className="ice-svg-drip drip-tip-1" />
          <div className="ice-svg-drip drip-tip-2" />
          <div className="ice-svg-drip drip-tip-3" />
          <div className="ice-svg-drip drip-tip-4" />
          <div className="ice-svg-drip drip-tip-5" />
          <div className="ice-svg-drip drip-tip-6" />

          {/* Falling Snowflakes & Ambient Frost Overlay */}
          <div className="frost-overlay" />
          <div className="snow-flake flake-1" />
          <div className="snow-flake flake-2" />
          <div className="snow-flake flake-3" />
          <div className="snow-flake flake-4" />
          <div className="snow-flake flake-5" />
          <div className="snow-flake flake-6" />
          <div className="snow-flake flake-7" />
          <div className="snow-flake flake-8" />
          <div className="snow-flake flake-9" />
          <div className="snow-flake flake-10" />
          <div className="snow-flake flake-11" />
          <div className="snow-flake flake-12" />
          <div className="snow-flake flake-13" />
          <div className="snow-flake flake-14" />
          <div className="snow-flake flake-15" />
          <div className="snow-flake flake-16" />
        </div>
      ) : null}

      {themeId === "matrix" ? <MatrixAtmosphere /> : null}

      {themeId === "deepsea" ? <DeepSeaAtmosphere /> : null}

      {themeId === "synthwave" ? <SynthwaveAtmosphere /> : null}

      {themeId === "enchanted" ? <ForestAtmosphere /> : null}

      {themeId === "hud" ? <StealthAtmosphere /> : null}

      {themeId === "dragon" ? <DragonAtmosphere /> : null}

      {themeId === "nebula" ? <NebulaAtmosphere /> : null}

      {themeId === "sakura" ? <SakuraAtmosphere /> : null}

      {themeId === "lightning" ? <LightningAtmosphere /> : null}

      {themeId === "drift" ? <DriftAtmosphere /> : null}

      {themeId === "codex" ? <CodexAtmosphere /> : null}

      {themeId === "dune" ? <DuneAtmosphere /> : null}

      {themeId === "crystal" ? <CrystalAtmosphere /> : null}

      {themeId === "cyberpunk" ? <CyberpunkAtmosphere /> : null}

      {themeId === "solar" ? <SolarAtmosphere /> : null}
      <header className="titlebar">
        <div className="titlebar-left">
          <h1 className="titlebar-app-name">DataStuff</h1>
          <button
            type="button"
            className="secondary manage-conn-btn"
            onClick={() => setShowManageModal(true)}
            disabled={busy}
            title="Manage saved connection profiles and credentials"
          >
            Connections...
          </button>
          <select
            id="saved-connections"
            className="titlebar-conn-select"
            value={selectedConnectionId}
            onChange={(e) => handleSelectConnection(e.target.value)}
            disabled={status.connected || busy}
            title={
              selectedConnectionId
                ? savedConnections.find((c) => c.id === selectedConnectionId)?.name
                : "Select saved connection profile"
            }
          >
            <option value="">— Profile —</option>
            {savedConnections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name}
              </option>
            ))}
          </select>
          {status.connected ? (
            <button type="button" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={!selectedConnectionId || busy}
              title={
                !selectedConnectionId
                  ? "Select a saved connection profile first"
                  : "Connect to profile"
              }
            >
              Connect
            </button>
          )}
          <span
            className={`status-dot ${status.connected ? "on" : ""}`}
            title={
              status.connected
                ? `Connected as ${status.user}@${status.connectString} (${status.mode ?? "jdbc"}${config.tcps ? " · tcps" : ""})`
                : "Not connected"
            }
          />
        </div>
        <div className="titlebar-spacer" />
        <button
          type="button"
          className="secondary format-sql-btn"
          onClick={onFormatSql}
          title="Reformat SQL query with 4-space indentations and subquery nesting on new lines (Cmd+Shift+F)"
        >
          ✨ Format
        </button>
        <label
          className="checkbox-row toolbar-auto-format"
          title="Automatically format queries immediately after execution"
        >
          <input
            type="checkbox"
            checked={autoFormat}
            onChange={(e) => setAutoFormat(e.target.checked)}
          />
          Auto
        </label>
        <div className="theme-picker">
          <select
            id="app-theme"
            value={themeId}
            disabled={status.connected && isProd}
            title={status.connected && isProd ? "Theme locked to Nuclear Silo while connected to Production" : "Select app theme"}
            onChange={(e) => setThemeId(e.target.value as AppThemeId)}
          >
            {APP_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </div>
        <div className="font-controls" title="App font size">
          <button
            type="button"
            onClick={() => bumpFontScale(-FONT_SCALE_STEP)}
            disabled={fontScale <= MIN_FONT_SCALE}
            aria-label="Decrease font size"
          >
            −
          </button>
          <span className="font-scale-label">{Math.round(fontScale * 100)}%</span>
          <button
            type="button"
            onClick={() => bumpFontScale(FONT_SCALE_STEP)}
            disabled={fontScale >= MAX_FONT_SCALE}
            aria-label="Increase font size"
          >
            +
          </button>
        </div>
      </header>

      <div
        className="body"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? "minmax(0, 1fr) 0px 28px"
            : `minmax(0, 1fr) 2px ${sidebarWidth}px`,
        }}
      >
        <main
          className="workspace"
          ref={workspaceRef}
          style={{
            gridTemplateRows: `minmax(100px, ${editorSplit}fr) 2px minmax(100px, ${1 - editorSplit}fr)`,
          }}
        >
          <div className="editor-pane">
            {activeTab ? (
              <>
                <SqlTabs
                  tabs={tabs}
                  activeId={activeTabId}
                  onSelect={setActiveTabId}
                  onClose={(id) => {
                    void closeTab(id);
                  }}
                  onAdd={() => {
                    void addTab();
                  }}
                  onOpen={() => {
                    void openTabs();
                  }}
                  onRename={(id, title) => {
                    void renameTab(id, title);
                  }}
                  onReorder={reorderTabs}
                  width={queryTabsWidth}
                />

                <div
                  className="query-tabs-split"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize query tabs and editor"
                  title="Drag to resize query tabs panel · double-click to reset width"
                  onPointerDown={onTabsPointerDown}
                  onPointerMove={onTabsPointerMove}
                  onPointerUp={onTabsPointerUp}
                  onPointerCancel={endTabsDrag}
                  onDoubleClick={() => setQueryTabsWidth(DEFAULT_QUERY_TABS_WIDTH)}
                />

                <div className="editor-wrapper">
                  <div className="query-copy-gutter">
                    {(() => {
                      void editorTick;
                      const viewportHeight =
                        editorRef.current?.getLayoutInfo().height ?? 600;
                      return sqlBlocks.map((block, idx) => {
                        let top =
                          12 +
                          (block.startLine - 1) * editorLineHeight -
                          editorScrollTop;
                        let height =
                          (block.endLine - block.startLine + 1) *
                          editorLineHeight;

                        if (editorRef.current) {
                          const model = editorRef.current.getModel();
                          const maxLine = model ? model.getLineCount() : block.endLine;
                          const startLineTop = editorRef.current.getTopForLineNumber(
                            Math.min(block.startLine, maxLine),
                          );
                          let endLineBottom: number;
                          if (block.endLine >= maxLine) {
                            const lastLineTop = editorRef.current.getTopForLineNumber(maxLine);
                            endLineBottom = lastLineTop + editorLineHeight;
                          } else {
                            endLineBottom = editorRef.current.getTopForLineNumber(
                              block.endLine + 1,
                            );
                          }
                          const currentScrollTop = editorRef.current
                            ? editorRef.current.getScrollTop()
                            : editorScrollTop;
                          top = startLineTop - currentScrollTop;
                          height = Math.max(editorLineHeight, endLineBottom - startLineTop);
                        }

                        const isCopied = copiedBlockId === block.id;

                        if (top + height < -50 || top > viewportHeight + 100)
                          return null;

                        const isShortBlock = height < 36;
                        const labelHeight = isShortBlock ? 14 : 52;
                        const visibleStart = Math.max(top, 0);
                        const visibleEnd = Math.min(
                          top + height,
                          viewportHeight,
                        );
                        const visibleCenter = (visibleStart + visibleEnd) / 2;
                        const idealTop = visibleCenter - top - labelHeight / 2;
                        const labelTop = Math.max(
                          2,
                          Math.min(
                            Math.max(2, height - labelHeight - 2),
                            idealTop,
                          ),
                        );

                        return (
                          <button
                            key={block.id}
                            type="button"
                            className={`query-copy-bar ${isCopied ? "copied" : ""}`}
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                            }}
                            title={`Click to copy Query ${idx + 1} (Lines ${block.startLine}–${block.endLine})`}
                            onClick={() => handleCopyQueryBlock(block)}
                          >
                            <span
                              className="query-copy-label"
                              style={{
                                top: `${labelTop}px`,
                              }}
                            >
                              {isCopied
                                ? isShortBlock ? "✓" : "✓ COPIED"
                                : isShortBlock ? `Q${idx + 1}` : `Query ${idx + 1}`}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  {copiedBlockId && <div className="query-copied-toast">✓ Query Copied!</div>}
                  <Editor
                    key={activeTabId}
                    height="100%"
                    defaultLanguage="sql"
                    theme={themeOption(themeId).monacoTheme}
                    defaultValue={sql}
                    onChange={(value) => {
                      if (monacoApiRef.current && editorRef.current) {
                        const model = editorRef.current.getModel();
                        if (model) {
                          monacoApiRef.current.editor.setModelMarkers(
                            model,
                            "oracle-error",
                            [],
                          );
                        }
                      }
                      setActiveSql(value ?? "");
                    }}
                    beforeMount={onEditorBeforeMount}
                    onMount={onEditorMount}
                    options={{
                      fontSize: Math.round(EDITOR_BASE_FONT_SIZE * fontScale),
                      lineHeight: Math.round(EDITOR_BASE_FONT_SIZE * fontScale) + 1,
                      fontFamily: "IBM Plex Mono, SF Mono, Menlo, Monaco, Consolas, monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      automaticLayout: true,
                      tabSize: 2,
                      padding: { top: 12 },
                      scrollbar: {
                        vertical: "visible",
                        horizontal: "visible",
                        verticalScrollbarSize: 12,
                        horizontalScrollbarSize: 12,
                        arrowSize: 0,
                      },
                      // Required so Shift+Enter keybindings are not bypassed by
                      // Native EditContext's beforeinput newline insertion.
                      editContext: false,
                      // Keep typing snappy — no autocomplete / word completion.
                      quickSuggestions: false,
                      suggestOnTriggerCharacters: false,
                      acceptSuggestionOnCommitCharacter: false,
                      acceptSuggestionOnEnter: "off",
                      tabCompletion: "off",
                      wordBasedSuggestions: "off",
                      parameterHints: { enabled: false },
                      snippetSuggestions: "none",
                      hover: { enabled: "off" },
                      inlayHints: { enabled: "off" },
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="empty-state">
                {!workspaceHydrated ? (
                  "Restoring SQL pages…"
                ) : (
                  <>
                    No SQL pages open.
                    <br />
                    Press <kbd>Cmd+O</kbd> to open a file from {sqlDir}, or{" "}
                    <kbd>Cmd+T</kbd> / <strong>+</strong> for a new tab.
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className="workspace-split"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize editor and results"
            aria-valuemin={Math.round(MIN_EDITOR_SPLIT * 100)}
            aria-valuemax={Math.round(MAX_EDITOR_SPLIT * 100)}
            aria-valuenow={Math.round(editorSplit * 100)}
            title="Drag to resize editor / results · double-click to reset"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onPointerCancel={endSplitDrag}
            onDoubleClick={() => setEditorSplit(DEFAULT_EDITOR_SPLIT)}
          />

          <section className="results-pane">
            <div className="results-header toolbar">
              <div className="bottom-tabs">
                <button
                  type="button"
                  className={bottomTab === "results" ? "active" : ""}
                  onClick={() => setBottomTab("results")}
                >
                  Results
                </button>
                <button
                  type="button"
                  className={bottomTab === "explain" ? "active" : ""}
                  onClick={() => handleExplainTabClick()}
                  title="Generate Explain Plan for SQL statement in editor"
                >
                  Explain Plan
                </button>
                <button
                  type="button"
                  className={bottomTab === "history" ? "active" : ""}
                  onClick={() => setBottomTab("history")}
                >
                  History ({history.length})
                </button>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={onExecute}
                  disabled={!status.connected || busy}
                  title="Run statement under cursor (Cmd+Enter / Ctrl+Enter or Shift+Enter)"
                >
                  Run
                </button>
                {busy && (
                  <button
                    type="button"
                    className="danger cancel-query-btn"
                    onClick={onCancelQuery}
                    title="Cancel running SQL query execution"
                  >
                    ⏹ Cancel Query
                  </button>
                )}
                <button
                  type="button"
                  className="success"
                  onClick={onCommit}
                  disabled={!status.connected || busy}
                  title={
                    pendingEditCount > 0
                      ? `Apply ${pendingEditCount} cell update(s) then commit the transaction`
                      : "Commit the current transaction"
                  }
                >
                  Commit{pendingEditCount > 0 ? ` (${pendingEditCount})` : ""}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={onRollback}
                  disabled={!status.connected || busy}
                  title={
                    pendingEditCount > 0
                      ? "Discard cell edits and roll back the transaction"
                      : "Roll back the current transaction"
                  }
                >
                  Rollback
                </button>
                <button
                  type="button"
                  className={density !== "normal" ? "active-toggle" : ""}
                  onClick={() => setDensity((prev) => nextDensity(prev))}
                  title="Cycle grid density: Normal → Compact → Crammed"
                >
                  {densityLabel(density)}
                </button>
                <label className="toolbar-field" htmlFor="maxRows">
                  MAX
                  <input
                    id="maxRows"
                    type="number"
                    min={1}
                    max={100000}
                    value={maxRows}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      if (!Number.isFinite(next)) return;
                      setMaxRows(Math.min(Math.max(next, 1), 100_000));
                    }}
                  />
                </label>
              </div>

              {bottomTab === "explain" && sqlBlocks.length > 1 ? (
                <div className="explain-query-selector">
                  <span className="explain-query-label">Explain Query:</span>
                  {sqlBlocks.map((block, idx) => (
                    <button
                      key={block.id}
                      type="button"
                      className={`explain-query-btn ${selectedExplainQueryIndex === idx ? "active" : ""}`}
                      onClick={() => handleExplainTabClick(idx)}
                      title={`Run Explain Plan for Query ${idx + 1} (Lines ${block.startLine}–${block.endLine})`}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="results-header-right">
                {bottomTab === "results" && resultSummary ? (
                  <span className="results-summary">
                    <strong>{resultSummary}</strong>
                    {result?.truncated ? ` · first ${maxRows.toLocaleString()} rows` : ""}
                  </span>
                ) : null}
                {bottomTab === "explain" && explainSummary ? (
                  <span className="results-summary">
                    <strong>{explainSummary}</strong>
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onExportCsv}
                  disabled={!canExport || busy}
                  title="Export current result grid to CSV"
                >
                  Export...
                </button>
              </div>
            </div>

            <div className="grid-wrap">
              {bottomTab === "history" ? (
                <HistoryPanel
                  entries={history}
                  onRestore={(restored) => {
                    setActiveSql(restored, true);
                    setBottomTab("results");
                  }}
                  onClear={() => setHistory([])}
                />
              ) : bottomTab === "explain" ? (
                explainError ? (
                  <div className="error-state">{explainError}</div>
                ) : !explainResult ? (
                  <div className="empty-state">
                    Click Explain Plan to see the execution plan and indexes for the
                    statement under the cursor.
                  </div>
                ) : explainResult.columns.length > 0 ? (
                  <ResultsGrid
                    result={explainResult}
                    density={density}
                    editable={false}
                    pendingEdits={{}}
                    onEdit={() => undefined}
                    fontScale={fontScale}
                    fitColumnsToContent
                    getCellTitle={explainCellTitle}
                  />
                ) : (
                  <div className="empty-state">Explain plan returned no rows.</div>
                )
              ) : error ? (
                <div className="error-state">
                  <div className="error-text">{error}</div>
                  {(() => {
                    const match = error.match(/at line (\d+)(?:,\s*column (\d+))?/i);
                    if (!match) return null;
                    const targetLine = Number.parseInt(match[1], 10);
                    const targetCol = match[2] ? Number.parseInt(match[2], 10) : 1;
                    return (
                      <button
                        type="button"
                        className="secondary jump-to-error-btn"
                        style={{ marginTop: 8, fontSize: 12, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                        onClick={() => {
                          if (editorRef.current) {
                            editorRef.current.setPosition({ lineNumber: targetLine, column: targetCol });
                            editorRef.current.revealLineInCenter(targetLine);
                            editorRef.current.focus();
                          }
                        }}
                      >
                        📍 Jump to Line {targetLine}, Column {targetCol}
                      </button>
                    );
                  })()}
                </div>
              ) : !result ? (
                <div className="empty-state">
                  Connect, write SQL, then Run to see rows here.
                </div>
              ) : result.isSelect && result.columns.length > 0 ? (
                <ResultsGrid
                  result={result}
                  density={density}
                  editable={gridEditable}
                  pendingEdits={pendingEdits}
                  onEdit={onCellEdit}
                  fontScale={fontScale}
                />
              ) : (
                <div className="empty-state">
                  Statement completed. {result.rowsAffected} row
                  {result.rowsAffected === 1 ? "" : "s"} affected.
                  <br />
                  Use Commit or Rollback to finish the transaction.
                </div>
              )}
            </div>
          </section>
        </main>

        {!sidebarCollapsed ? (
          <div
            className="sidebar-split"
            title="Drag to resize object browser · double-click to reset"
            onPointerDown={onSidebarPointerDown}
            onPointerMove={onSidebarPointerMove}
            onPointerUp={onSidebarPointerUp}
            onPointerCancel={endSidebarDrag}
            onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          />
        ) : null}

        <ObjectBrowser
          connected={status.connected}
          refreshKey={objectsRefresh}
          onInsertSql={insertObjectName}
          onOpenSelect={openSelectForObject}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />
      </div>

      <footer className="status-bar">
        <span className={error ? "error" : "ok"}>{message}</span>
        {busy && queryStartTime ? (
          <span className="live-query-timer" title="Current SQL query execution length in real time">
            ⏱ {formatLiveElapsedTime(queryElapsedTimeMs)}
          </span>
        ) : null}
        {busy ? (
          <button
            type="button"
            className="danger cancel-query-btn status-bar-cancel-btn"
            onClick={onCancelQuery}
            title="Cancel running SQL query execution"
          >
            ⏹ Cancel Query
          </button>
        ) : null}
        <span className="save-status">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? `Saved · ${activeTab?.fileName ?? ""} · ${sqlDir}`
              : saveState === "error"
                ? "Save failed"
                : null}
        </span>
      </footer>

      {showManageModal ? (
        <div
          className="modal-backdrop"
          onMouseDown={handleManageBackdropMouseDown}
          onClick={handleManageBackdropClick}
        >
          <div className="modal connection-manage-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Manage Connection Profiles</h2>
            <p className="subtitle">
              Configure parameters, connection profiles, and PROD security options.
            </p>

            <div className="manage-modal-body">
              <div className="modal-field-group">
                <div className="field saved-profiles">
                  <label htmlFor="modal-saved-connections">Saved Profiles</label>
                  <div className="saved-profile-select-row">
                    <select
                      id="modal-saved-connections"
                      value={selectedConnectionId}
                      onChange={(e) => handleSelectConnection(e.target.value)}
                    >
                      <option value="">— New / Unsaved Connection —</option>
                      {savedConnections.map((conn) => (
                        <option key={conn.id} value={conn.id}>
                          {conn.name} ({conn.user}@{conn.host})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field connection-name">
                  <label htmlFor="modal-connection-name-input">Profile Name</label>
                  <input
                    id="modal-connection-name-input"
                    value={connectionName}
                    placeholder="e.g. Prod DB, Dev PDB..."
                    onChange={(e) => setConnectionName(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-field-grid">
                <div className="field user">
                  <label htmlFor="modal-user">User</label>
                  <input
                    id="modal-user"
                    value={config.user}
                    onChange={(e) => updateField("user", e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="field password">
                  <label htmlFor="modal-password">Password</label>
                  <input
                    id="modal-password"
                    type="password"
                    value={config.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="field host">
                  <label htmlFor="modal-host">Host</label>
                  <input
                    id="modal-host"
                    value={config.host}
                    onChange={(e) => updateField("host", e.target.value)}
                  />
                </div>
                <div className="field port">
                  <label htmlFor="modal-port">Port</label>
                  <input
                    id="modal-port"
                    value={config.port}
                    onChange={(e) => updateField("port", e.target.value)}
                  />
                </div>
                <div className="field service">
                  <label htmlFor="modal-service">Service</label>
                  <input
                    id="modal-service"
                    value={config.service}
                    onChange={(e) => updateField("service", e.target.value)}
                    placeholder="ORCLPDB1"
                  />
                </div>
                <div className="field tcps">
                  <label htmlFor="modal-tcps">TLS</label>
                  <label className="checkbox-row" htmlFor="modal-tcps">
                    <input
                      id="modal-tcps"
                      type="checkbox"
                      checked={!!config.tcps}
                      onChange={(e) => updateField("tcps", e.target.checked)}
                    />
                    TCPS
                  </label>
                </div>
              </div>

              <div className="modal-field-group">
                <label
                  className="field remember-password"
                  title={
                    passwordStorageAvailable
                      ? "Store password encrypted with the macOS Keychain"
                      : "Secure storage unavailable"
                  }
                >
                  <input
                    type="checkbox"
                    checked={rememberPassword && passwordStorageAvailable}
                    disabled={!passwordStorageAvailable}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setRememberPassword(next);
                      void persistPassword(config.password, next);
                    }}
                  />
                  Remember Password in Keychain
                </label>

                <div className="field prod-flag">
                  <label className={`checkbox-row prod-checkbox-label ${isProd ? "is-prod" : ""}`} htmlFor="modal-is-prod-toggle">
                    <input
                      id="modal-is-prod-toggle"
                      type="checkbox"
                      checked={isProd}
                      onChange={(e) => setIsProd(e.target.checked)}
                    />
                    {isProd ? "PROD (SILO LOCK)" : "PROD Environment"}
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={handleSaveConnection}
                disabled={!config.user || !config.host || !config.service}
              >
                Save Profile
              </button>
              {selectedConnectionId ? (
                <button
                  type="button"
                  className="danger"
                  onClick={handleDeleteConnection}
                >
                  Delete Profile
                </button>
              ) : null}
              <button
                type="button"
                className="primary"
                onClick={() => setShowManageModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProdCommitConfirm ? (
        <div
          className="modal-backdrop"
          onClick={() => setShowProdCommitConfirm(false)}
        >
          <div
            className="modal prod-commit-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "440px" }}
          >
            <h2 style={{ color: "#ef4444", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              ⚠️ Production Commit Confirmation
            </h2>
            <p style={{ marginTop: "12px", lineHeight: "1.5", fontSize: "14px" }}>
              You are connected to a <strong>PRODUCTION</strong> database environment (<strong>{connectionName || "PROD"}</strong>).
            </p>
            <p style={{ marginTop: "8px", color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.4" }}>
              Are you sure you want to permanently commit your transaction to Production?
            </p>
            <div
              className="modal-actions"
              style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}
            >
              <button
                type="button"
                className="secondary"
                onClick={() => setShowProdCommitConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={executeCommit}
                autoFocus
              >
                Yes, Commit to Production
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bindModalState?.open && (
        <BindVariablesModal
          varNames={bindModalState.varNames}
          initialValues={bindValues}
          onConfirm={onConfirmBindModal}
          onCancel={() => setBindModalState(null)}
        />
      )}
    </div>
  );
}

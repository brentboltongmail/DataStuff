export type AppThemeId =
  | "default"
  | "rainbow"
  | "disco"
  | "brass"
  | "spaceship"
  | "aetherium"
  | "racecar"
  | "lava"
  | "ice"
  | "nuclear"
  | "matrix"
  | "deepsea"
  | "synthwave"
  | "enchanted"
  | "hud"
  | "dragon"
  | "nebula"
  | "sakura"
  | "lightning"
  | "drift"
  | "codex"
  | "dune"
  | "crystal"
  | "cyberpunk"
  | "solar"
  | "knightrider"
  | "solarsystem";

export interface AppThemeOption {
  id: AppThemeId;
  label: string;
  monacoTheme: string;
}

export const THEME_KEY = "oracle-ide.theme";

export const APP_THEMES: AppThemeOption[] = [
  { id: "default", label: "Default", monacoTheme: "datastuff-default" },
  { id: "rainbow", label: "🌈 Rainbow Splatter Mode", monacoTheme: "datastuff-rainbow" },
  { id: "disco", label: "🪩 Disco Party Mode", monacoTheme: "datastuff-disco" },
  { id: "brass", label: "Brass", monacoTheme: "datastuff-brass" },
  { id: "spaceship", label: "Space", monacoTheme: "datastuff-spaceship" },
  { id: "aetherium", label: "Aetherium", monacoTheme: "datastuff-aetherium" },
  { id: "racecar", label: "Race", monacoTheme: "datastuff-racecar" },
  { id: "lava", label: "Lava", monacoTheme: "datastuff-lava" },
  { id: "ice", label: "Ice", monacoTheme: "datastuff-ice" },
  { id: "nuclear", label: "Nuclear Silo [PROD]", monacoTheme: "datastuff-nuclear" },
  { id: "matrix", label: "Matrix Cyber-Rain", monacoTheme: "datastuff-matrix" },
  { id: "deepsea", label: "Deep Sea Bioluminescence", monacoTheme: "datastuff-deepsea" },
  { id: "synthwave", label: "Synthwave Outrun", monacoTheme: "datastuff-synthwave" },
  { id: "enchanted", label: "Enchanted Forest", monacoTheme: "datastuff-enchanted" },
  { id: "hud", label: "Stealth Fighter HUD", monacoTheme: "datastuff-hud" },
  { id: "dragon", label: "Obsidian Dragon", monacoTheme: "datastuff-dragon" },
  { id: "nebula", label: "Nebula Odyssey", monacoTheme: "datastuff-nebula" },
  { id: "sakura", label: "Sakura Rain", monacoTheme: "datastuff-sakura" },
  { id: "lightning", label: "High-Voltage Lightning", monacoTheme: "datastuff-lightning" },
  { id: "drift", label: "Midnight Drift", monacoTheme: "datastuff-drift" },
  { id: "codex", label: "Ancient Codex", monacoTheme: "datastuff-codex" },
  { id: "dune", label: "Dune Spice", monacoTheme: "datastuff-dune" },
  { id: "crystal", label: "Crystal Cavern", monacoTheme: "datastuff-crystal" },
  { id: "cyberpunk", label: "Cyberpunk City 2077", monacoTheme: "datastuff-cyberpunk" },
  { id: "solar", label: "Solar Flare", monacoTheme: "datastuff-solar" },
  { id: "knightrider", label: "🏎️ Night Car", monacoTheme: "datastuff-knightrider" },
  { id: "solarsystem", label: "🪐 Solar System", monacoTheme: "datastuff-solarsystem" },
];

const THEME_IDS = new Set<AppThemeId>(APP_THEMES.map((theme) => theme.id));

export function loadTheme(): AppThemeId {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw && THEME_IDS.has(raw as AppThemeId)) return raw as AppThemeId;
  return "default";
}

export function themeOption(id: AppThemeId): AppThemeOption {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0];
}

export function applyThemeToDocument(id: AppThemeId): void {
  document.documentElement.dataset.theme = id;
}

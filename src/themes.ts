export type AppThemeId =
  | "default"
  | "brass"
  | "spaceship"
  | "aetherium"
  | "racecar"
  | "lava"
  | "ice"
  | "nuclear";

export interface AppThemeOption {
  id: AppThemeId;
  label: string;
  monacoTheme: string;
}

export const THEME_KEY = "oracle-ide.theme";

export const APP_THEMES: AppThemeOption[] = [
  { id: "default", label: "Default", monacoTheme: "datastuff-default" },
  { id: "brass", label: "Brass", monacoTheme: "datastuff-brass" },
  { id: "spaceship", label: "Space", monacoTheme: "datastuff-spaceship" },
  { id: "aetherium", label: "Aetherium", monacoTheme: "datastuff-aetherium" },
  { id: "racecar", label: "Race", monacoTheme: "datastuff-racecar" },
  { id: "lava", label: "Lava", monacoTheme: "datastuff-lava" },
  { id: "ice", label: "Ice", monacoTheme: "datastuff-ice" },
  { id: "nuclear", label: "Nuclear Silo [PROD]", monacoTheme: "datastuff-nuclear" },
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

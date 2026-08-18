export type AppFontId =
  | "chalkboard"
  | "comic"
  | "sans"
  | "mono"
  | "serif"
  | "scifi"
  | "outfit"
  | "source"
  | "theme";

export interface AppFontOption {
  id: AppFontId;
  label: string;
  fontFamily: string;
  monoFontFamily?: string;
}

export const FONT_KEY = "oracle-ide.font";

export const APP_FONTS: AppFontOption[] = [
  {
    id: "chalkboard",
    label: "✏️ Chalkboard",
    fontFamily: '"Chalkboard", "Chalkboard SE", "Comic Neue", "Comic Sans MS", cursive, sans-serif',
    monoFontFamily: '"Chalkboard", "Chalkboard SE", "Comic Neue", "Comic Sans MS", cursive, monospace',
  },
  {
    id: "comic",
    label: "🎨 Comic Neue",
    fontFamily: '"Comic Neue", "Chalkboard", "Comic Sans MS", cursive, sans-serif',
    monoFontFamily: '"Comic Neue", "Chalkboard", "Comic Sans MS", cursive, monospace',
  },
  {
    id: "sans",
    label: "🔤 System Sans",
    fontFamily: '"SF Pro Text", "Helvetica Neue", system-ui, -apple-system, sans-serif',
    monoFontFamily: '"SF Mono", "Menlo", "Monaco", "Consolas", monospace',
  },
  {
    id: "mono",
    label: "💻 IBM Plex Mono",
    fontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace',
    monoFontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace',
  },
  {
    id: "serif",
    label: "📖 Fraunces Serif",
    fontFamily: '"Fraunces", "Cormorant Garamond", "Georgia", serif',
    monoFontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", monospace',
  },
  {
    id: "scifi",
    label: "🚀 Orbitron Sci-Fi",
    fontFamily: '"Orbitron", "Exo 2", system-ui, sans-serif',
    monoFontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", monospace',
  },
  {
    id: "outfit",
    label: "✨ Outfit Modern",
    fontFamily: '"Outfit", "Source Sans 3", system-ui, sans-serif',
    monoFontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", monospace',
  },
  {
    id: "source",
    label: "📝 Source Sans",
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    monoFontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", "Monaco", monospace',
  },
  {
    id: "theme",
    label: "🎨 Theme Default",
    fontFamily: 'var(--font-ui)',
    monoFontFamily: 'var(--font-mono)',
  },
];

const FONT_IDS = new Set<AppFontId>(APP_FONTS.map((font) => font.id));

export function loadFont(): AppFontId {
  const raw = localStorage.getItem(FONT_KEY);
  if (raw && FONT_IDS.has(raw as AppFontId)) return raw as AppFontId;
  return "chalkboard";
}

export function fontOption(id: AppFontId): AppFontOption {
  return APP_FONTS.find((font) => font.id === id) ?? APP_FONTS[0];
}

export function applyFontToDocument(id: AppFontId): void {
  document.documentElement.dataset.font = id;
}

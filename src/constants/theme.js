// ── Theming ──────────────────────────────────────────────────────────────
// The app supports a Dark (default) and Light mode plus a user-chosen accent
// colour. Screens read their colours at render time via useThemeColors()
// (src/lib/ThemeContext). The static COLORS export below stays = the default
// (dark + blue) so any screen not yet converted still renders correctly.

// Everything EXCEPT the accent (primary/primaryDark stay from the accent preset).
const DARK_BASE = {
  background: '#050810',
  surface: '#0C1022',
  card: '#111827',
  accent: '#06B6D4',
  text: '#F0F4FF',
  textSecondary: '#8B9CC8',
  textMuted: '#3D4F7A',
  success: '#10B981',
  error: '#F43F5E',
  border: '#1E2D4A',
};
const LIGHT_BASE = {
  background: '#C6CFDD',   // muted grey-blue, distinctly not bright
  surface: '#CFD6E2',      // cards only a touch lighter than the bg — understated
  card: '#CFD6E2',
  accent: '#0E7490',
  text: '#161D29',
  textSecondary: '#41506A',
  textMuted: '#6E7C95',
  success: '#047857',
  error: '#BE123C',
  border: '#BAC4D5',       // soft edge, not a hard outline
};

// Accent presets — the user's pick sets primary + primaryDark everywhere.
// `companion` is a close-but-distinct neighbour (used for the secondary accent,
// e.g. the class section) so it harmonises with the chosen colour without
// matching it exactly: blue→teal, purple→indigo, and so on.
export const ACCENTS = {
  blue:   { label: 'Blue',   primary: '#3B82F6', primaryDark: '#1D4ED8', companion: '#06B6D4' },
  purple: { label: 'Purple', primary: '#8B5CF6', primaryDark: '#6D28D9', companion: '#6366F1' },
  green:  { label: 'Green',  primary: '#10B981', primaryDark: '#059669', companion: '#14B8A6' },
  orange: { label: 'Orange', primary: '#F59E0B', primaryDark: '#D97706', companion: '#F97316' },
  pink:   { label: 'Pink',   primary: '#EC4899', primaryDark: '#BE185D', companion: '#F43F5E' },
  teal:   { label: 'Teal',   primary: '#06B6D4', primaryDark: '#0E7490', companion: '#0EA5E9' },
};
export const ACCENT_KEYS = ['blue', 'purple', 'green', 'orange', 'pink', 'teal'];
export const THEME_MODES = ['dark', 'light'];

// Build a full colour palette for a mode + accent key.
export function buildColors(mode = 'dark', accentKey = 'blue') {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  const a = ACCENTS[accentKey] || ACCENTS.blue;
  // accent = the companion, so the secondary-accent UI tracks the chosen colour.
  return { ...base, primary: a.primary, primaryDark: a.primaryDark, accent: a.companion || a.primary };
}

// Default = dark + blue = exactly the original palette. This object is MUTATED
// in place by applyTheme() so every `import { COLORS }` reference (inline colours
// in JSX) reflects the current theme after the consuming component re-renders.
export const COLORS = buildColors('dark', 'blue');

let THEME_VERSION = 0;
// Swap the whole app's colours to a mode + accent (mutates COLORS in place and
// bumps a version so themedStyles() rebuilds).
export function applyTheme(mode, accentKey) {
  Object.assign(COLORS, buildColors(mode, accentKey));
  THEME_VERSION += 1;
}
// A drop-in replacement for a module-level `StyleSheet.create({...})` that
// rebuilds from the live COLORS whenever the theme changes. Usage:
//   const styles = themedStyles(() => StyleSheet.create({ ... COLORS.x ... }));
// The consuming component must re-render on theme change (call useThemeSync) for
// the new styles to show; cached per theme version so it's cheap.
export function themedStyles(factory) {
  let cache = null;
  let ver = -1;
  const build = () => {
    if (ver !== THEME_VERSION) { cache = factory(); ver = THEME_VERSION; }
    return cache;
  };
  return new Proxy({}, {
    get: (_, key) => build()[key],
    has: (_, key) => key in build(),
    ownKeys: () => Reflect.ownKeys(build()),
    getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(build(), key),
  });
}

export const FONTS = {
  regular: 'System',
  bold: 'System',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Shared bottom-tab bar style. Exported so screens can hide it (e.g. when a
// chat is open) and restore it to the exact same look afterwards.
export const makeTabBarStyle = (colors = COLORS) => ({
  backgroundColor: colors.surface,
  borderTopColor: colors.border,
  borderTopWidth: 1,
  height: 84,
  paddingBottom: 20,
  paddingTop: 10,
});
export const TAB_BAR_STYLE = makeTabBarStyle();

export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

export const INSTRUMENTS = ['Guitar', 'Bass'];

export const GOALS = [
  'Play at gigs',
  'Record original music',
  'Reach Grade 8',
  'Join a band',
  'Just improve',
  'Learn specific songs',
];

export const SKILLS = [
  'Technique',
  'Music Theory',
  'Improvisation',
  'Songwriting',
  'Sight Reading',
  'Ear Training',
];

export const PRACTICE_DURATIONS = [
  { label: '15 mins', value: 15 },
  { label: '30 mins', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '3+ hours', value: 180 },
];

// lowercase to match Firestore schema and Cloud Functions validation
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

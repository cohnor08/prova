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
  surface: '#DAE0EC',      // soft grey cards, clearly off-white
  card: '#DAE0EC',
  accent: '#0E7490',
  text: '#161D29',
  textSecondary: '#41506A',
  textMuted: '#6E7C95',
  success: '#047857',
  error: '#BE123C',
  border: '#AEBACE',       // defined edges so cards still read as panels
};

// Accent presets — the user's pick sets primary + primaryDark everywhere.
export const ACCENTS = {
  blue:   { label: 'Blue',   primary: '#3B82F6', primaryDark: '#1D4ED8' },
  purple: { label: 'Purple', primary: '#8B5CF6', primaryDark: '#6D28D9' },
  green:  { label: 'Green',  primary: '#10B981', primaryDark: '#059669' },
  orange: { label: 'Orange', primary: '#F59E0B', primaryDark: '#D97706' },
  pink:   { label: 'Pink',   primary: '#EC4899', primaryDark: '#BE185D' },
  teal:   { label: 'Teal',   primary: '#06B6D4', primaryDark: '#0E7490' },
};
export const ACCENT_KEYS = ['blue', 'purple', 'green', 'orange', 'pink', 'teal'];
export const THEME_MODES = ['dark', 'light'];

// Build a full colour palette for a mode + accent key.
export function buildColors(mode = 'dark', accentKey = 'blue') {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  const a = ACCENTS[accentKey] || ACCENTS.blue;
  return { ...base, primary: a.primary, primaryDark: a.primaryDark };
}

// Default = dark + blue = exactly the original palette.
export const COLORS = buildColors('dark', 'blue');

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

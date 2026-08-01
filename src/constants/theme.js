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
  onPrimary: '#FFFFFF',
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
  onPrimary: '#FFFFFF',
};

// ── SKY (the default palette) ────────────────────────────────────────────────
// `border` sits only a touch lighter than `card`, so card outlines read as a
// faint edge rather than a drawn box — that softness is the point of the palette.
// Labels on a filled surface are WHITE (`onPrimary`), and that sets the ceiling
// on how light the signal colour can be. #2A99DB is the LIGHTEST blue white text
// survives on: 3.14:1, just over the 3:1 needed for bold labels. Every step
// lighter fades the label — #2E9EE0 is 2.96, the pale #7DD3FC only 1.7. If a
// lighter blue is ever wanted, the labels have to go dark; the two can't both
// happen.
// Small chips (teacher tab pills, student avatars) are deliberately NOT solid
// filled — they use a tint with light text, because a small solid pale block
// with dark text reads as a heavy patch on a dark screen.
const SKY_BASE = {
  background: '#171A21',
  surface: '#2A303C',      // raised / nested wells — LIGHTER than card, not darker
  card: '#212630',
  // The SECONDARY accent. Class sections use this while teacher sections use
  // primary, so the two must not be the same colour — with accent set equal to
  // primary they collapsed and a class read identically to a teacher. A teal
  // neighbour of the azure: clearly related, clearly not the same. Deep enough
  // that white labels still clear 3:1 on it.
  accent: '#1D93A1',
  text: '#F4F6FA',
  textSecondary: '#A8B2C4',
  textMuted: '#8A94A8',   // 4.6:1 on a card — clears AA for the 11px all-caps labels it's used on
  success: '#6EE7B7',
  error: '#FCA5A5',
  border: '#333B4A',       // clear of BOTH card and surface, so hairlines read on either
  onPrimary: '#FFFFFF',    // white labels on every filled surface
};

// ── The palette registry ─────────────────────────────────────────────────────
// Adding a theme ("Caramel", "Jungle", …) means adding ONE entry here plus its
// category set below — no screen changes, no new plumbing. `ownAccent` means the
// palette defines its own signal colour, so the accent picker doesn't apply.
export const PALETTES = {
  sky:   { label: 'Sky',   icon: 'partly-sunny', base: SKY_BASE },
  dark:  { label: 'Dark',  icon: 'moon',         base: DARK_BASE },
  light: { label: 'Light', icon: 'sunny',        base: LIGHT_BASE },
};
export const DEFAULT_MODE = 'sky';

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

// ── Accent sets, per palette ─────────────────────────────────────────────────
// A saturated accent that looks right on a near-black ground looks garish on
// Sky's lifted one, and a soft accent disappears on Dark. So each palette gets
// its own set of presets rather than sharing one.
//
// Every preset carries its own `companion` (the secondary accent — class
// sections use it, teacher sections use primary, so they must differ) and its
// own `onPrimary`, because how light a preset is decides whether a label on it
// can be white. Each of the soft ones below clears 3:1 against white, so they
// all keep white labels.
const SOFT_ACCENTS = {
  blue:   { label: 'Blue',   primary: '#2A99DB', primaryDark: '#1E7CB5', companion: '#1D93A1', onPrimary: '#FFFFFF' },
  teal:   { label: 'Teal',   primary: '#1D93A1', primaryDark: '#17727C', companion: '#2A99DB', onPrimary: '#FFFFFF' },
  violet: { label: 'Violet', primary: '#7C6FD6', primaryDark: '#5F53B0', companion: '#8E7BD9', onPrimary: '#FFFFFF' },
  green:  { label: 'Green',  primary: '#3FA07A', primaryDark: '#2F7A5C', companion: '#1D93A1', onPrimary: '#FFFFFF' },
  rose:   { label: 'Rose',   primary: '#C4708D', primaryDark: '#9C566F', companion: '#7C6FD6', onPrimary: '#FFFFFF' },
  sand:   { label: 'Sand',   primary: '#B8894A', primaryDark: '#8F6A38', companion: '#C4708D', onPrimary: '#FFFFFF' },
};
export const ACCENT_SETS = {
  sky:   SOFT_ACCENTS,
  dark:  ACCENTS,
  light: ACCENTS,
};
// The swatches Profile draws, for whichever palette is active.
export function accentsFor(mode) {
  return ACCENT_SETS[mode === 'softsky' ? 'sky' : mode] || ACCENT_SETS.dark;
}
export function accentKeysFor(mode) {
  return Object.keys(accentsFor(mode));
}
export const THEME_MODES = ['sky', 'dark', 'light'];

// Build a full colour palette for a mode + accent key.
export function buildColors(mode = DEFAULT_MODE, accentKey = 'blue') {
  // 'softsky' was the preview's name for what is now the default.
  const key = mode === 'softsky' ? 'sky' : mode;
  const p = PALETTES[key] || PALETTES[DEFAULT_MODE];
  const set = accentsFor(key);
  // A key saved under another palette may not exist here — fall back to its first.
  const a = set[accentKey] || set[Object.keys(set)[0]];
  return {
    ...p.base,
    primary: a.primary,
    primaryDark: a.primaryDark,
    // accent = the companion, so class sections stay distinct from teacher ones.
    accent: a.companion || a.primary,
    onPrimary: a.onPrimary || p.base.onPrimary,
  };
}

// Default = Sky. This object is MUTATED
// in place by applyTheme() so every `import { COLORS }` reference (inline colours
// in JSX) reflects the current theme after the consuming component re-renders.
export const COLORS = buildColors(DEFAULT_MODE, 'blue');

let THEME_VERSION = 0;
// Swap the whole app's colours to a mode + accent (mutates COLORS in place and
// bumps a version so themedStyles() rebuilds).
export function applyTheme(mode, accentKey) {
  Object.assign(COLORS, buildColors(mode, accentKey));
  // CATEGORY_COLORS is mutated in place for the same reason COLORS is: screens
  // import it once at module load and read it at render time.
  const catKey = mode === 'softsky' ? 'sky' : mode;
  const set = accentsFor(catKey);
  const chosen = set[accentKey] || set[Object.keys(set)[0]];
  Object.assign(CATEGORY_COLORS, deriveCategories(chosen.primary, CAT_TONE[catKey] || CAT_TONE.dark));
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

// Mutated by applyTheme(); consumers import this object once and read it live.
// ── Category rails, derived from the accent ──────────────────────────────────
// The rails have to LOOK like they belong to whatever accent is chosen, not sit
// there as six unrelated colours. So instead of a fixed list per palette, they're
// generated from the accent's own hue: each category keeps a fixed angular offset
// from it, and every rail shares one saturation and lightness. Change the accent
// and the whole family rotates with it, staying recognisably one set.
//
// The offsets are taken from the relationship the hand-picked default set already
// had — green sitting well below the blue, violet well above it — so Sky + Blue
// reproduces almost exactly the softened set that was tuned by eye.
const CAT_OFFSETS = {
  ear_training:  -48,
  warmup:        -15,
  repertoire:      0,
  technique:      17,
  improvisation:  29,
  theory:         55,
};
// Soft on Sky's lifted ground; more saturated on the near-black ones, where a
// muted rail would disappear.
const CAT_TONE = { sky: { s: 0.55, l: 0.66 }, dark: { s: 0.72, l: 0.60 }, light: { s: 0.62, l: 0.48 } };

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
// Six rails that belong to `primaryHex`.
export function deriveCategories(primaryHex, tone) {
  const { h } = hexToHsl(primaryHex);
  const out = {};
  for (const k in CAT_OFFSETS) out[k] = hslToHex(h + CAT_OFFSETS[k], tone.s, tone.l);
  return out;
}

// Mutated by applyTheme(); consumers import this object once and read it live.
export const CATEGORY_COLORS = { ...deriveCategories(accentsFor(DEFAULT_MODE).blue.primary, CAT_TONE[DEFAULT_MODE]) };

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

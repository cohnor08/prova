export const COLORS = {
  background: '#050810',
  surface: '#0C1022',
  card: '#111827',
  primary: '#3B82F6',
  primaryDark: '#1D4ED8',
  accent: '#06B6D4',
  text: '#F0F4FF',
  textSecondary: '#8B9CC8',
  textMuted: '#3D4F7A',
  success: '#10B981',
  error: '#F43F5E',
  border: '#1E2D4A',
};

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

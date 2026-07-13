// Achievement badges — earned once, kept forever (persisted on the user doc as
// badges: { id: earnedAtISO }). Icons are Ionicons names rendered inside a
// Prova ring medallion; `tier` picks the ring colour (1 steel → 4 gold).
// Checks run against badgeStats() in src/lib/badges.js.
export const TIER_COLORS = { 1: '#7A8AAD', 2: '#3B82F6', 3: '#22D3EE', 4: '#F5C044' };

export const BADGES = [
  // Sessions
  { id: 'sess_1',    icon: 'musical-notes', tier: 1, title: 'First Session',    desc: 'Complete your first practice session', check: (s) => s.totalSessions >= 1,   hint: (s) => `${s.totalSessions}/1` },
  { id: 'sess_10',   icon: 'musical-notes', tier: 2, title: 'Ten Deep',         desc: 'Complete 10 practice sessions',        check: (s) => s.totalSessions >= 10,  hint: (s) => `${s.totalSessions}/10` },
  { id: 'sess_30',   icon: 'musical-notes', tier: 3, title: 'Thirty Strong',    desc: 'Complete 30 practice sessions',        check: (s) => s.totalSessions >= 30,  hint: (s) => `${s.totalSessions}/30` },
  { id: 'sess_100',  icon: 'musical-notes', tier: 4, title: 'Centurion',        desc: 'Complete 100 practice sessions',       check: (s) => s.totalSessions >= 100, hint: (s) => `${s.totalSessions}/100` },
  // Streaks (persist once earned, even if the streak later breaks)
  { id: 'streak_3',  icon: 'flame', tier: 1, title: 'On a Roll',      desc: 'Practice 3 days in a row',   check: (s) => s.streak >= 3,   hint: (s) => `${s.streak}/3 days` },
  { id: 'streak_7',  icon: 'flame', tier: 2, title: 'Locked In',      desc: 'Practice 7 days in a row',   check: (s) => s.streak >= 7,   hint: (s) => `${s.streak}/7 days` },
  { id: 'streak_14', icon: 'flame', tier: 2, title: 'Fortnight Fire', desc: 'Practice 14 days in a row',  check: (s) => s.streak >= 14,  hint: (s) => `${s.streak}/14 days` },
  { id: 'streak_30', icon: 'flame', tier: 3, title: 'Unstoppable',    desc: 'Practice 30 days in a row',  check: (s) => s.streak >= 30,  hint: (s) => `${s.streak}/30 days` },
  { id: 'streak_100',icon: 'flame', tier: 4, title: 'Legend',         desc: 'Practice 100 days in a row', check: (s) => s.streak >= 100, hint: (s) => `${s.streak}/100 days` },
  // Hours
  { id: 'hrs_1',   icon: 'time', tier: 1, title: 'First Hour',    desc: 'Practice for 1 hour total',    check: (s) => s.totalMinutes >= 60,   hint: (s) => `${Math.floor(s.totalMinutes / 60)}/1h` },
  { id: 'hrs_5',   icon: 'time', tier: 1, title: 'Five Alive',    desc: 'Practice for 5 hours total',   check: (s) => s.totalMinutes >= 300,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/5h` },
  { id: 'hrs_10',  icon: 'time', tier: 2, title: 'Ten Hours In',  desc: 'Practice for 10 hours total',  check: (s) => s.totalMinutes >= 600,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/10h` },
  { id: 'hrs_25',  icon: 'time', tier: 2, title: 'Night Shifter', desc: 'Practice for 25 hours total',  check: (s) => s.totalMinutes >= 1500, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/25h` },
  { id: 'hrs_50',  icon: 'time', tier: 3, title: 'Fifty Club',    desc: 'Practice for 50 hours total',  check: (s) => s.totalMinutes >= 3000, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/50h` },
  { id: 'hrs_100', icon: 'time', tier: 4, title: 'Hundred Hours', desc: 'Practice for 100 hours total', check: (s) => s.totalMinutes >= 6000, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/100h` },
  // Score
  { id: 'score_500',   icon: 'trophy', tier: 2, title: 'Point Getter',  desc: 'Reach 500 Prova points',    check: (s) => s.provaScore >= 500,   hint: (s) => `${s.provaScore}/500` },
  { id: 'score_2500',  icon: 'trophy', tier: 3, title: 'Point Machine', desc: 'Reach 2,500 Prova points',  check: (s) => s.provaScore >= 2500,  hint: (s) => `${s.provaScore}/2.5k` },
  { id: 'score_10000', icon: 'trophy', tier: 4, title: 'Point Royalty', desc: 'Reach 10,000 Prova points', check: (s) => s.provaScore >= 10000, hint: (s) => `${s.provaScore}/10k` },
  // Teacher tasks + songs
  { id: 'task_1',  icon: 'school', tier: 1, title: "Teacher's Orders",  desc: 'Complete your first teacher task', check: (s) => s.tasksCompleted >= 1,  hint: (s) => `${s.tasksCompleted}/1` },
  { id: 'task_25', icon: 'school', tier: 3, title: 'Star Student',      desc: 'Complete 25 teacher tasks',        check: (s) => s.tasksCompleted >= 25, hint: (s) => `${s.tasksCompleted}/25` },
  { id: 'song_1',  icon: 'mic',    tier: 1, title: 'Song Smith',        desc: 'Finish a learn-a-song step',       check: (s) => s.songSteps >= 1,       hint: (s) => `${s.songSteps}/1` },
  { id: 'song_20', icon: 'mic',    tier: 3, title: 'Repertoire Rising', desc: 'Finish 20 learn-a-song steps',     check: (s) => s.songSteps >= 20,      hint: (s) => `${s.songSteps}/20` },
  // The long game — genuinely hard to earn
  { id: 'sess_250',   icon: 'musical-notes', tier: 4, title: 'The Machine',      desc: 'Complete 250 practice sessions',      check: (s) => s.totalSessions >= 250,   hint: (s) => `${s.totalSessions}/250` },
  { id: 'sess_500',   icon: 'musical-notes', tier: 4, title: 'Institution',      desc: 'Complete 500 practice sessions',      check: (s) => s.totalSessions >= 500,   hint: (s) => `${s.totalSessions}/500` },
  { id: 'streak_180', icon: 'flame',         tier: 4, title: 'Half-Year Hero',   desc: 'Practice 180 days in a row',          check: (s) => s.streak >= 180,          hint: (s) => `${s.streak}/180 days` },
  { id: 'streak_365', icon: 'flame',         tier: 4, title: 'Year of Fire',     desc: 'Practice 365 days in a row',          check: (s) => s.streak >= 365,          hint: (s) => `${s.streak}/365 days` },
  { id: 'hrs_250',    icon: 'time',          tier: 4, title: 'Quarter Thousand', desc: 'Practice for 250 hours total',        check: (s) => s.totalMinutes >= 15000,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/250h` },
  { id: 'hrs_500',    icon: 'time',          tier: 4, title: 'Five Hundred',     desc: 'Practice for 500 hours total',        check: (s) => s.totalMinutes >= 30000,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/500h` },
  { id: 'score_25000',icon: 'trophy',        tier: 4, title: 'Point Overlord',   desc: 'Reach 25,000 Prova points',           check: (s) => s.provaScore >= 25000,    hint: (s) => `${s.provaScore}/25k` },
  { id: 'score_50000',icon: 'trophy',        tier: 4, title: 'Untouchable',      desc: 'Reach 50,000 Prova points',           check: (s) => s.provaScore >= 50000,    hint: (s) => `${s.provaScore}/50k` },
  { id: 'task_100',   icon: 'school',        tier: 4, title: 'Curriculum Crusher', desc: 'Complete 100 teacher tasks',        check: (s) => s.tasksCompleted >= 100,  hint: (s) => `${s.tasksCompleted}/100` },
  { id: 'goal_10',    icon: 'flag',          tier: 3, title: 'Goal Getter',      desc: 'Achieve 10 of your own goals',        check: (s) => s.goalsCompleted >= 10,   hint: (s) => `${s.goalsCompleted}/10` },
];

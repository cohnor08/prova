// Achievement badges — earned once, kept forever (persisted on the user doc as
// badges: { id: earnedAtISO }). Checks run against the stats snapshot from
// badgeStats() in src/lib/badges.js. `hint` renders on locked badges.
export const BADGES = [
  // Sessions
  { id: 'sess_1',    icon: '🎸', title: 'First Session',   desc: 'Complete your first practice session',  check: (s) => s.totalSessions >= 1,   hint: (s) => `${s.totalSessions}/1 session` },
  { id: 'sess_10',   icon: '🎯', title: 'Ten Deep',        desc: 'Complete 10 practice sessions',         check: (s) => s.totalSessions >= 10,  hint: (s) => `${s.totalSessions}/10 sessions` },
  { id: 'sess_30',   icon: '🎼', title: 'Thirty Strong',   desc: 'Complete 30 practice sessions',         check: (s) => s.totalSessions >= 30,  hint: (s) => `${s.totalSessions}/30 sessions` },
  { id: 'sess_100',  icon: '💯', title: 'Centurion',       desc: 'Complete 100 practice sessions',        check: (s) => s.totalSessions >= 100, hint: (s) => `${s.totalSessions}/100 sessions` },
  // Streaks (persist once earned, even if the streak later breaks)
  { id: 'streak_3',  icon: '🔥', title: 'On a Roll',       desc: 'Practice 3 days in a row',              check: (s) => s.streak >= 3,   hint: (s) => `${s.streak}/3 days` },
  { id: 'streak_7',  icon: '⚡', title: 'Locked In',       desc: 'Practice 7 days in a row',              check: (s) => s.streak >= 7,   hint: (s) => `${s.streak}/7 days` },
  { id: 'streak_14', icon: '🌟', title: 'Fortnight Fire',  desc: 'Practice 14 days in a row',             check: (s) => s.streak >= 14,  hint: (s) => `${s.streak}/14 days` },
  { id: 'streak_30', icon: '🏆', title: 'Unstoppable',     desc: 'Practice 30 days in a row',             check: (s) => s.streak >= 30,  hint: (s) => `${s.streak}/30 days` },
  { id: 'streak_100',icon: '👑', title: 'Legend',          desc: 'Practice 100 days in a row',            check: (s) => s.streak >= 100, hint: (s) => `${s.streak}/100 days` },
  // Hours
  { id: 'hrs_1',   icon: '⏱', title: 'First Hour',       desc: 'Practice for 1 hour total',              check: (s) => s.totalMinutes >= 60,   hint: (s) => `${Math.floor(s.totalMinutes / 60)}/1 hr` },
  { id: 'hrs_5',   icon: '🕐', title: 'Five Alive',       desc: 'Practice for 5 hours total',             check: (s) => s.totalMinutes >= 300,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/5 hrs` },
  { id: 'hrs_10',  icon: '🎧', title: 'Ten Hours In',     desc: 'Practice for 10 hours total',            check: (s) => s.totalMinutes >= 600,  hint: (s) => `${Math.floor(s.totalMinutes / 60)}/10 hrs` },
  { id: 'hrs_25',  icon: '🌙', title: 'Night Shifter',    desc: 'Practice for 25 hours total',            check: (s) => s.totalMinutes >= 1500, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/25 hrs` },
  { id: 'hrs_50',  icon: '🚀', title: 'Fifty Club',       desc: 'Practice for 50 hours total',            check: (s) => s.totalMinutes >= 3000, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/50 hrs` },
  { id: 'hrs_100', icon: '💎', title: 'Hundred Hours',    desc: 'Practice for 100 hours total',           check: (s) => s.totalMinutes >= 6000, hint: (s) => `${Math.floor(s.totalMinutes / 60)}/100 hrs` },
  // Score
  { id: 'score_500',   icon: '🥉', title: 'Point Getter',  desc: 'Reach 500 Prova points',                check: (s) => s.provaScore >= 500,   hint: (s) => `${s.provaScore}/500 pts` },
  { id: 'score_2500',  icon: '🥈', title: 'Point Machine', desc: 'Reach 2,500 Prova points',              check: (s) => s.provaScore >= 2500,  hint: (s) => `${s.provaScore}/2,500 pts` },
  { id: 'score_10000', icon: '🥇', title: 'Point Royalty', desc: 'Reach 10,000 Prova points',             check: (s) => s.provaScore >= 10000, hint: (s) => `${s.provaScore}/10,000 pts` },
  // Teacher tasks + songs
  { id: 'task_1',  icon: '✅', title: "Teacher's Orders",  desc: 'Complete your first teacher task',       check: (s) => s.tasksCompleted >= 1,  hint: (s) => `${s.tasksCompleted}/1 task` },
  { id: 'task_25', icon: '📚', title: 'Star Student',      desc: 'Complete 25 teacher tasks',              check: (s) => s.tasksCompleted >= 25, hint: (s) => `${s.tasksCompleted}/25 tasks` },
  { id: 'song_1',  icon: '🎵', title: 'Song Smith',        desc: 'Finish a learn-a-song step',             check: (s) => s.songSteps >= 1,       hint: (s) => `${s.songSteps}/1 step` },
  { id: 'song_20', icon: '🎤', title: 'Repertoire Rising', desc: 'Finish 20 learn-a-song steps',           check: (s) => s.songSteps >= 20,      hint: (s) => `${s.songSteps}/20 steps` },
];

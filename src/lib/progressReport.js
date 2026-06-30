import { doc, getDoc, getDocs, collection, query, orderBy, limit, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { displayScore, scoreRank, formatScore } from './score';

// The single source of truth for the shareable "my week" progress report, used
// by both the Progress tab share sheet and the in-chat "Send progress" action.
export function formatProgressReport({ weekPoints, daysPracticed, weekMins, streak, provaScore, rankName, level }) {
  const h = Math.floor(weekMins / 60); const m = weekMins % 60;
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
`🎸 My Prova week

+${formatScore(weekPoints)} Prova points this week
Practiced ${daysPracticed}/7 days · ${timeStr}
🔥 ${streak}-day streak
Total: ${formatScore(provaScore)} pts · ${rankName}
Level: ${level}`);
}

// Loads a user's stats and returns the formatted report text. Mirrors the
// weekly-points baseline logic the Progress screen uses (a rolling 7-day delta
// anchored on the user doc).
export async function fetchProgressReport(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const data = userSnap.data() || {};
  const provaScore = displayScore(data);

  const now = Date.now();
  const baseDate = data.weekScoreDate ? new Date(data.weekScoreDate).getTime() : null;
  let weekPoints;
  if (data.weekScoreBaseline == null || !baseDate || now - baseDate >= 7 * 86400000) {
    weekPoints = 0;
    updateDoc(doc(db, 'users', uid), { weekScoreBaseline: provaScore, weekScoreDate: new Date().toISOString() }).catch(() => {});
  } else {
    weekPoints = Math.max(0, provaScore - data.weekScoreBaseline);
  }

  const logsSnap = await getDocs(query(collection(db, 'sessionHistory', uid, 'logs'), orderBy('date', 'desc'), limit(14)));
  const wkCut = new Date(); wkCut.setDate(wkCut.getDate() - 6);
  const cutoffYmd = `${wkCut.getFullYear()}-${String(wkCut.getMonth() + 1).padStart(2, '0')}-${String(wkCut.getDate()).padStart(2, '0')}`;
  let weekMins = 0; let daysPracticed = 0;
  logsSnap.forEach((d) => {
    const log = d.data();
    if (d.id >= cutoffYmd && (log.totalMinutes || 0) > 0) { weekMins += log.totalMinutes; daysPracticed += 1; }
  });

  return formatProgressReport({
    weekPoints,
    daysPracticed,
    weekMins,
    streak: data.streak || 0,
    provaScore,
    rankName: scoreRank(provaScore).name,
    level: data.level || 'Beginner',
  });
}

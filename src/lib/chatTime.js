// Friendly "when was this sent" labels for chat messages.
//
// Messages carry a Firestore serverTimestamp in `timestamp` (or a plain ms
// number in `ts` for demo threads); a just-sent message's server time can be
// null for a beat, so every helper tolerates missing values.

export function msgMs(m) {
  const t = m?.timestamp;
  if (t?.toMillis) return t.toMillis();
  if (t?.toDate) return t.toDate().getTime();
  if (typeof m?.ts === 'number') return m.ts;
  return null;
}

// "3:42 PM"
export function timeLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

// "Today" / "Yesterday" / weekday inside a week / "17/07/26" beyond that.
export function dayLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}

export function sameDay(aMs, bMs) {
  if (!aMs || !bMs) return false;
  const a = new Date(aMs);
  const b = new Date(bMs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

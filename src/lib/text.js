// Text helpers for keeping lists tidy.
//
// THE RULE, so future screens don't drift:
//   * A list of EVEN ROWS (today's sessions, assigned tasks, completed tasks)
//     gets ONE line, and the text is shortened with shortTitle() to fit. Rows
//     that are all the same height read as a list; ragged ones read as a mess.
//   * Anything else (setlists, song library, song-plan steps) gets TWO lines and
//     a tail ellipsis. A wrapped title beats a truncated one when the rows
//     aren't meant to match.
//   * Any Text inside a flex row needs its container on `flex: 1, minWidth: 0`.
//     Without minWidth a flex child can't shrink below its content width, so the
//     text clips instead of wrapping no matter what numberOfLines says. Run
//     `node scripts/scan-truncation.cjs` to find violations.

// Shorten a title so it fits one line. Caps by CHARACTERS, not words — word
// count is the wrong measure, since "Advanced Voicing & Reharmonization" is four
// words and far too wide. Cuts at the first dash/colon/comma/bracket, then trims
// back to the last whole word inside the cap, so a cut never lands mid-word.
//
//   "Advanced Voicing & Reharmonization" -> "Advanced Voicing"
//   "Legato Warmup — build fluidity..."  -> "Legato Warmup"
//   "Dexterity Warm-Up"                  -> unchanged
export function shortTitle(full, max = 24) {
  let t = String(full || '').split(/\s+[—–-]\s+|[:(,]/)[0].trim();
  if (t.length <= max) return t || String(full || '');
  const cut = t.slice(0, max + 1);
  const sp = cut.lastIndexOf(' ');
  t = (sp > 8 ? cut.slice(0, sp) : cut.slice(0, max)).trim();
  return t.replace(/[\s,;:.&–—-]+$/, '');
}

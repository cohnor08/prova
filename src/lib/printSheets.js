// Printable sheets for the library: chord boxes, a scale mapped across the
// neck, and a lesson topic — as one black-on-white page you can print or save
// as a PDF.
//
// The phone prints it with expo-print and the web apps print it from a hidden
// iframe, both from THIS file (mirrored into web/shared/ by
// scripts/sync-shared.cjs), so the sheet is the same page everywhere. Keep it
// free of imports — that's what lets it be shared.
//
// Everything is inline SVG at a fixed size: no fonts to load, no images to
// fetch, and it renders the same whether it's going to a printer or a PDF.

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Standard tuning, high E (1st string) first — the same orientation as the
// app's ScaleDiagram and as TAB.
const STRINGS = [
  { label: 'e', pc: 4 },
  { label: 'B', pc: 11 },
  { label: 'G', pc: 7 },
  { label: 'D', pc: 2 },
  { label: 'A', pc: 9 },
  { label: 'E', pc: 4 },
];

// Ink, not theme: a sheet is printed, so it's black on white whatever the app
// is wearing. Grey scales down to a decent black-and-white printout too.
const INK = '#111827';
const LINE = '#9AA3AF';
const SOFT = '#6B7280';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const scaleNotes = (rootIndex, intervals) =>
  (intervals || []).map((i) => NOTES[(rootIndex + i) % 12]);

export const noteIndex = (name) => NOTES.indexOf(String(name || '').trim());

// ── one chord box ─────────────────────────────────────────────────────────
// Same geometry as src/components/ChordDiagram.js: 6 strings low-E first, a
// 4-fret window, the base fret labelled when the shape sits up the neck.
export function chordDiagramSvg(chord) {
  const frets = Array.isArray(chord && chord.frets) ? chord.frets : [];
  const fingers = Array.isArray(chord && chord.fingers) ? chord.fingers : null;
  const STR = 6, FRETS = 4, CW = 17, RH = 22, PAD_TOP = 20, PAD_LEFT = 26, PAD_RIGHT = 12, DOT = 7;
  const boardW = CW * (STR - 1);
  const boardH = RH * FRETS;
  const W = PAD_LEFT + boardW + PAD_RIGHT;
  const H = PAD_TOP + boardH + 8;
  const pressed = frets.filter((f) => f > 0);
  const maxF = pressed.length ? Math.max.apply(null, pressed) : 0;
  const minF = pressed.length ? Math.min.apply(null, pressed) : 0;
  const baseFret = maxF <= FRETS ? 1 : minF;
  const openPos = baseFret === 1;
  const x = (i) => PAD_LEFT + i * CW;
  const y = (r) => PAD_TOP + r * RH;

  let o = '';
  if (openPos) o += `<rect x="${PAD_LEFT}" y="${PAD_TOP - 2}" width="${boardW}" height="3" fill="${INK}"/>`;
  else o += `<text x="${PAD_LEFT - 8}" y="${y(0) + RH * 0.65}" text-anchor="end" font-size="10" font-weight="700" fill="${SOFT}">${baseFret}fr</text>`;
  for (let r = 0; r <= FRETS; r++) o += `<line x1="${PAD_LEFT}" y1="${y(r)}" x2="${PAD_LEFT + boardW}" y2="${y(r)}" stroke="${LINE}" stroke-width="1"/>`;
  for (let i = 0; i < STR; i++) o += `<line x1="${x(i)}" y1="${PAD_TOP}" x2="${x(i)}" y2="${PAD_TOP + boardH}" stroke="${LINE}" stroke-width="1"/>`;
  frets.forEach((f, i) => {
    const cx = x(i);
    if (f < 0) { o += `<text x="${cx}" y="${PAD_TOP - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${SOFT}">&#215;</text>`; return; }
    if (f === 0) { o += `<circle cx="${cx}" cy="${PAD_TOP - 9}" r="4" fill="none" stroke="${SOFT}" stroke-width="1.3"/>`; return; }
    const pos = f - baseFret + 1;
    if (pos < 1 || pos > FRETS) return;
    const cy = PAD_TOP + (pos - 0.5) * RH;
    o += `<circle cx="${cx}" cy="${cy}" r="${DOT}" fill="${INK}"/>`;
    const finger = fingers ? fingers[i] : 0;
    if (finger > 0) o += `<text x="${cx}" y="${cy + 3.4}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${finger}</text>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${o}</svg>`;
}

// ── the whole neck for one scale ──────────────────────────────────────────
// Same map as src/components/ScaleDiagram.js, drawn bigger because it's going
// on paper: every fretted note in the scale, roots filled in.
export function scaleDiagramSvg(rootIndex, intervals) {
  // PAD_BOTTOM leaves room for the fret numbers BELOW the bottom string's
  // note circles (r=11) — at 26 they printed on top of each other.
  const FRETS = 12, FW = 46, SH = 30, PAD_LEFT = 34, PAD_TOP = 16, PAD_BOTTOM = 36;
  const boardW = FW * FRETS;
  const boardH = SH * (STRINGS.length - 1);
  const W = PAD_LEFT + boardW + 16;
  const H = PAD_TOP + boardH + PAD_BOTTOM;
  const inScale = {};
  (intervals || []).forEach((i) => { inScale[(rootIndex + i) % 12] = true; });
  const sy = (r) => PAD_TOP + r * SH;
  const wireX = (f) => PAD_LEFT + f * FW;
  const dotX = (f) => PAD_LEFT + (f - 0.5) * FW;

  let o = '';
  [3, 5, 7, 9].forEach((f) => { o += `<circle cx="${dotX(f)}" cy="${PAD_TOP + boardH / 2}" r="3.5" fill="#D1D5DB"/>`; });
  o += `<circle cx="${dotX(12)}" cy="${sy(1)}" r="3.5" fill="#D1D5DB"/><circle cx="${dotX(12)}" cy="${sy(4)}" r="3.5" fill="#D1D5DB"/>`;
  for (let f = 0; f <= FRETS; f++) {
    o += f === 0
      ? `<rect x="${PAD_LEFT - 2}" y="${PAD_TOP}" width="4" height="${boardH}" fill="${INK}"/>`
      : `<line x1="${wireX(f)}" y1="${PAD_TOP}" x2="${wireX(f)}" y2="${PAD_TOP + boardH}" stroke="${LINE}" stroke-width="1"/>`;
  }
  STRINGS.forEach((s, r) => {
    o += `<text x="${PAD_LEFT - 14}" y="${sy(r) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${SOFT}">${s.label}</text>`;
    o += `<line x1="${PAD_LEFT}" y1="${sy(r)}" x2="${PAD_LEFT + boardW}" y2="${sy(r)}" stroke="${LINE}" stroke-width="1"/>`;
  });
  [3, 5, 7, 9, 12].forEach((f) => {
    o += `<text x="${dotX(f)}" y="${PAD_TOP + boardH + 26}" text-anchor="middle" font-size="11" font-weight="600" fill="${SOFT}">${f}</text>`;
  });
  STRINGS.forEach((s, r) => {
    for (let f = 1; f <= FRETS; f++) {
      const pc = (s.pc + f) % 12;
      if (!inScale[pc]) continue;
      const isRoot = pc === rootIndex;
      const cx = dotX(f), cy = sy(r);
      o += `<circle cx="${cx}" cy="${cy}" r="11" fill="${isRoot ? INK : '#fff'}" stroke="${INK}" stroke-width="${isRoot ? 0 : 1.2}"/>`;
      o += `<text x="${cx}" y="${cy + 3.6}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${isRoot ? '#fff' : INK}">${NOTES[pc]}</text>`;
    }
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${o}</svg>`;
}

// ── the page itself ───────────────────────────────────────────────────────
// A4 with real margins, and rules that stop a chord box or a step being cut in
// half by a page break.
export function sheetDocument({ title, heading, sub, body }) {
  const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || heading || 'Prova')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: ${INK}; background: #fff;
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid ${INK};
    padding-bottom: 8px; margin-bottom: 16px; }
  .brand { font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
  .when { margin-left: auto; font-size: 11px; color: ${SOFT}; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: ${SOFT}; font-size: 13px; margin: 0 0 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 14px; }
  .box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px 6px 4px; text-align: center;
    break-inside: avoid; page-break-inside: avoid; }
  .box .n { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
  .box svg { max-width: 100%; height: auto; }
  .notes { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
  .note { border: 1px solid ${INK}; border-radius: 999px; padding: 3px 11px; font-weight: 700; font-size: 13px; }
  .note.root { background: ${INK}; color: #fff; }
  .board { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
  .board svg { width: 100%; height: auto; }
  ol { padding-left: 20px; margin: 0; }
  li { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
  .steps { list-style: none; padding: 0; margin: 0; }
  .steps li { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 12px; }
  .tick { flex: none; width: 15px; height: 15px; border: 1.5px solid ${INK}; border-radius: 3px; margin-top: 3px; }
  .lines { margin-top: 22px; break-inside: avoid; page-break-inside: avoid; }
  .lines .lab { font-size: 11px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
    color: ${SOFT}; margin-bottom: 8px; }
  .lines div.rule { border-bottom: 1px solid #D1D5DB; height: 26px; }
  .foot { margin-top: 22px; border-top: 1px solid #E5E7EB; padding-top: 8px;
    font-size: 11px; color: ${SOFT}; }
  .lede { margin: 0 0 16px; }
</style></head><body>
  <div class="head"><span class="brand">Prova</span><span class="when">${esc(when)}</span></div>
  <h1>${esc(heading || '')}</h1>
  ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
  ${body}
  <div class="foot">Printed from Prova — practice tracked in the app.</div>
</body></html>`;
}

// A page of chord boxes, in whatever selection the screen is showing.
export function chordSheetHtml({ chords, heading, sub }) {
  const list = Array.isArray(chords) ? chords : [];
  const body = list.length
    ? `<div class="grid">${list.map((c) => `<div class="box"><div class="n">${esc(c.name)}</div>${chordDiagramSvg(c)}</div>`).join('')}</div>`
    : '<p>No chords selected.</p>';
  return sheetDocument({
    title: heading || 'Chords',
    heading: heading || 'Chords',
    sub: sub || `${list.length} shape${list.length === 1 ? '' : 's'}`,
    body,
  });
}

// One scale: the notes it's built from, then every one of them on the neck.
export function scaleSheetHtml({ rootName, scaleName, intervals }) {
  const rootIndex = noteIndex(rootName);
  const idx = rootIndex < 0 ? 0 : rootIndex;
  const notes = scaleNotes(idx, intervals);
  const heading = `${NOTES[idx]} ${scaleName || 'scale'}`;
  const body = `
    <div class="notes">${notes.map((n, i) => `<span class="note${i === 0 ? ' root' : ''}">${esc(n)}</span>`).join('')}</div>
    <div class="board">${scaleDiagramSvg(idx, intervals)}</div>
    <p class="sub">Filled circles are the root (${esc(NOTES[idx])}). Strings run high to low, top to bottom —
      the same way round as the fretboard in the app.</p>`;
  return sheetDocument({ title: heading, heading, sub: `${notes.length} notes · standard tuning`, body });
}

// A lesson-library topic: what it is, then its practice steps, numbered.
export function topicSheetHtml({ title, meta, summary, steps }) {
  const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
  // Tick boxes, not just numbers: on paper the point is to work through it and
  // mark off what you've done. Ruled lines at the end for the teacher's notes.
  const body = `
    ${summary ? `<p class="lede">${esc(summary)}</p>` : ''}
    ${list.length
      ? `<ul class="steps">${list.map((s) => `<li><span class="tick"></span><span>${esc(typeof s === 'string' ? s : s.text)}</span></li>`).join('')}</ul>`
      : '<p>No practice steps listed for this topic.</p>'}
    <div class="lines"><div class="lab">Notes</div>
      ${'<div class="rule"></div>'.repeat(4)}</div>`;
  return sheetDocument({ title, heading: title, sub: meta, body });
}

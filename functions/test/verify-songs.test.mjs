// Offline tests for the setlist song verifier in functions/index.js.
// Fixtures are real response shapes captured from the iTunes Search API, so
// this runs without network and without burning Apple's ~20 calls/minute.
//
//   node functions/test/verify-songs.test.mjs

import fs from 'fs';
const src = fs.readFileSync('/Users/ethanlam/prova/functions/index.js','utf8');
const block = src.slice(src.indexOf('const songStrip'), src.indexOf('// ─── generateSetlist'));
const mod = await import('data:text/javascript,'+encodeURIComponent(
  'export let fetchImpl = globalThis.fetch;\nexport const setFetch=(f)=>{fetchImpl=f;};\n'
  + block.replace(/\bfetch\(/g,'fetchImpl(') + '\nexport { verifyOneSong, verifySongs };\n'));

// Real shapes observed from the live API earlier in this session.
const T = (trackName, artistName, collectionName='Album') => ({trackName, artistName, collectionName});
const DB = {
  'wonderwall oasis':       [T('Wonderwall','Oasis'), T('Wonderwall','Boyce Avenue')],
  'wonderwall':             [T('Wonderwall','Oasis'), T('Wonderwall','Boyce Avenue')],
  'wonderwall coldplay':    [T('Yellow','Coldplay'), T('Fix You','Coldplay')],
  'billie jean prince':     [T('Billie Jean','Chris Cornell'), T('Purple Rain','Prince')],
  'billie jean':            [T('Billie Jean','Michael Jackson'), T('Billie Jean','Chris Cornell')],
  'aeroplane red hot chili peppers': [T('Scar Tissue','Red Hot Chili Peppers'), T('Aeroplane','Rockabye Baby!')],
  'aeroplane':              [T('Aeroplane','Zach Bryan'), T('Aeroplane','Björk')],
  'hotel california eagles':[T('Hotel California','Eagles')],
  'i bet you look good on the dancefloor arctic monkeys':
      [T('I Bet You Look Good on the Dancefloor (Live)','Arctic Monkeys'),
       T('I Bet You Look Good on the Dancefloor','Arctic Monkeys')],
  'karaoke trap song someone': [T('Karaoke Trap Song','The Karaoke Crew','Karaoke Hits')],
  'karaoke trap song':         [T('Karaoke Trap Song','The Karaoke Crew','Karaoke Hits')],
};
mod.setFetch(async (url) => {
  const term = decodeURIComponent(new URL(url).searchParams.get('term')||'').toLowerCase().trim();
  return { ok:true, status:200, text: async () => JSON.stringify({ results: DB[term] ?? [] }) };
});

const CASES = [
  ['Wonderwall','Oasis','ok','Oasis'],
  ['Hotel California','Eagles','ok','Eagles'],
  // canonical studio title preferred over the Live cut
  ['I Bet You Look Good on the Dancefloor','Arctic Monkeys','ok','Arctic Monkeys'],
  // wrong artist → dropped, NOT rewritten
  ['Wonderwall','Coldplay','unknown',null],
  ['Billie Jean','Prince','unknown',null],
  // deep cut Apple ranks poorly → dropped, but never mis-credited
  ['Aeroplane','Red Hot Chili Peppers','unknown',null],
  // invented → dropped
  ['Totally Made Up Song','Nobody At All','unknown',null],
];
let pass=0,fail=0;
for (const [t,a,want,wantArtist] of CASES) {
  const v = await mod.verifyOneSong(t,a);
  const ok = v.status===want && (!wantArtist || v.artist===wantArtist);
  ok?pass++:fail++;
  console.log(`${ok?' ':'!'} ${v.status.padEnd(8)} "${t}" — ${a}` +
    (v.artist?`  →  "${v.title}" — ${v.artist}`:'') + (ok?'':`   WANT ${want}/${wantArtist||'-'}`));
}
console.log(`\n${pass}/${CASES.length} correct`);
if (fail) process.exitCode = 1;

// A full setlist: 7 in, the bad ones removed, order and notes preserved.
const set = [
  {title:'Wonderwall',artist:'Oasis',note:'opener'},
  {title:'Wonderwall',artist:'Coldplay',note:'wrong artist'},
  {title:'Hotel California',artist:'Eagles',note:'mid'},
  {title:'Totally Made Up Song',artist:'Nobody At All',note:'invented'},
  {title:'Billie Jean',artist:'Prince',note:'wrong artist'},
  {title:'I Bet You Look Good on the Dancefloor',artist:'Arctic Monkeys',note:'closer'},
];
const r = await mod.verifySongs(set);
console.log('\nsetlist:', r.stats);
r.songs.forEach(s=>console.log(`   "${s.title}" — ${s.artist}   [${s.note}]`));
const ordered = r.songs.map(s=>s.note).join(',') === 'opener,mid,closer';
console.log('order preserved:', ordered);
if (!ordered || r.stats.dropped !== 3) process.exitCode = 1;

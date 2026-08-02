// Flags text that can only ever show one line, and flex children that cannot
// shrink — the two causes of the truncation you see as "…" or a mid-word chop.
//
//   node scripts/scan-truncation.cjs
//
// Not every hit is a bug: a fixed-width chip or a metadata row is fine on one
// line. Titles and names are not. Run it after adding a screen.
const fs = require('fs'), path = require('path');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) files.push(f);
  }
})('src');

let clamps = 0, starved = 0;
for (const f of files) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    // a flex child with no minWidth can't shrink, so its text clips rather than wraps
    if (/style=\{\{\s*flex:\s*1\s*\}\}/.test(line)) {
      console.log(`${f}:${i + 1}  flex:1 without minWidth:0 — text inside cannot wrap`);
      starved++;
    }
    if (/numberOfLines=\{1\}/.test(line) && /(itle|ame|abel)\b/i.test(line)) {
      console.log(`${f}:${i + 1}  single-line title — will ellipsise`);
      clamps++;
    }
  });
}
console.log(`\n${starved} unshrinkable flex child(ren) · ${clamps} single-line title(s)`);

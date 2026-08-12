#!/usr/bin/env node
// Mirrors the dependency-free logic modules from src/ into web/shared/ so the
// hand-written web app (web/webapp, web/studio) can import the SAME code the
// phone app runs instead of keeping its own copy.
//
// This exists because the copies drifted and nobody noticed: web/webapp had a
// ported theory-quiz generator that still spelled every diminished chord with
// sharps months after the app was fixed. A copy you have to remember to update
// is a copy that will be wrong.
//
//   node scripts/sync-shared.cjs          copy src -> web/shared
//   node scripts/sync-shared.cjs --check  fail if they differ (no writes)
//
// Only files with NO imports belong here — pure data and rules. Anything that
// reaches for React Native or Firebase cannot be shared this way.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'shared');
const FILES = ['src/constants/theory.js'];

const check = process.argv.includes('--check');
let bad = 0;

fs.mkdirSync(OUT, { recursive: true });
for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  const dest = path.join(OUT, path.basename(rel));
  const body = fs.readFileSync(src, 'utf8');

  if (/^\s*import\s/m.test(body)) {
    console.error(`✗ ${rel} has imports — it can't be shared with the web app as-is`);
    bad++;
    continue;
  }

  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  if (check) {
    if (current !== body) {
      console.error(`✗ web/shared/${path.basename(rel)} is out of date — run: node scripts/sync-shared.cjs`);
      bad++;
    }
  } else if (current !== body) {
    fs.writeFileSync(dest, body);
    console.log(`→ synced ${rel}`);
  }
}

if (bad) process.exit(1);
console.log(check ? `✅ web/shared matches src (${FILES.length} file(s))` : `✅ web/shared up to date (${FILES.length} file(s))`);

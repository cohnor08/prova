#!/usr/bin/env node
// Syntax-check the inline scripts in the hand-written web pages. These are
// single-file apps with no build step, so nothing else would catch a stray
// brace until the page is already live and blank.
//
//   node scripts/check-webapp-syntax.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['web/webapp/index.html', 'web/studio/index.html', 'web/index.html'];
const root = path.dirname(__dirname);
let bad = 0;

// vm.Script can't parse top-level import/export, so a module body is checked
// with those lines removed — enough to catch the unbalanced-brace class of
// mistake, which is the one that actually happens when hand-editing these.
const stripModuleSyntax = (code) => code
  .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*import\s*['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*export\s+(default\s+)?/gm, '');

for (const rel of FILES) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  let n = 0;

  while ((m = re.exec(html))) {
    const [, attrs, code] = m;
    if (!code.trim()) continue;
    // Skip data blocks like application/ld+json.
    if (/type\s*=\s*["'](?!module|text\/javascript|application\/javascript)/.test(attrs)) continue;
    n++;
    const line = html.slice(0, m.index).split('\n').length;
    const isModule = /type\s*=\s*["']module/.test(attrs);
    const source = isModule ? stripModuleSyntax(code) : code;
    try {
      new vm.Script(source, { filename: `${rel}:${line}` });
    } catch (err) {
      console.error(`✗ ${rel} (script at line ${line}): ${err.message}`);
      bad++;
    }
  }
  if (n) console.log(`${bad ? '·' : '✓'} ${rel} — ${n} script block${n === 1 ? '' : 's'}`);
}

if (bad) console.error(`\n${bad} script block${bad === 1 ? '' : 's'} failed to parse.`);
process.exit(bad ? 1 : 0);

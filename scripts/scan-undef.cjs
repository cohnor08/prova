// Scans every source file for identifiers that are USED but never declared,
// imported, or built in — the `kbLift` / `unloadAll` class of bug, which the
// bundler happily compiles and only explodes at runtime on the one code path
// that touches it.
const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const GLOBALS = new Set(['console','setTimeout','clearTimeout','setInterval','clearInterval','require','module','exports','process','global','Math','JSON','Object','Array','String','Number','Boolean','Date','Promise','Map','Set','WeakMap','WeakSet','Error','RegExp','Symbol','BigInt','Infinity','NaN','undefined','null','true','false','fetch','URL','URLSearchParams','TextEncoder','TextDecoder','AbortController','encodeURIComponent','decodeURIComponent','parseInt','parseFloat','isNaN','isFinite','__DEV__','globalThis','window','document','navigator','localStorage','alert','FormData','Blob','File','FileReader','XMLHttpRequest','WebSocket','performance','structuredClone','queueMicrotask','atob','btoa','Intl','Reflect','Proxy','ArrayBuffer','Uint8Array','requestAnimationFrame','cancelAnimationFrame','HTMLElement','Image','CustomEvent','Event','DataView','Int8Array','Int16Array','Int32Array','Uint16Array','Uint32Array','Uint8ClampedArray','Float32Array','Float64Array','SharedArrayBuffer']);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) files.push(f);
  }
})('src');
files.push('App.js');

let findings = 0;
for (const file of files) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread', 'dynamicImport'],
    });
  } catch (e) { console.log(`PARSE FAIL ${file}: ${e.message}`); findings++; continue; }

  traverse(ast, {
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (GLOBALS.has(name)) return;
      if (p.scope.hasBinding(name, true)) return;
      // JSX member expressions / property keys are not references we care about
      if (p.parentPath.isJSXAttribute?.()) return;
      console.log(`${file}:${p.node.loc.start.line}  undefined identifier: ${name}`);
      findings++;
    },
  });
}
console.log(findings === 0 ? '\n✅ no undefined identifiers across ' + files.length + ' files'
                           : `\n❌ ${findings} finding(s) across ${files.length} files`);

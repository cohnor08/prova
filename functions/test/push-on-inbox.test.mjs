// Offline test for pushOnInboxWrite in functions/index.js.
//   node functions/test/push-on-inbox.test.mjs
// Exercise the real trigger body from functions/index.js with a fake Firestore
// and a fake Expo endpoint — proves the token pruning and payload shape without
// needing a device or a deploy.
import fs from 'fs';

const src = fs.readFileSync('/Users/ethanlam/prova/functions/index.js','utf8');
// Pull just the handler out of the exports.* wrapper so it can be called.
// Brace-match the handler out of index.js so the test always runs the real one.
const i = src.indexOf('async (snap, context) => {');
let d = 0, end = i;
for (let k = src.indexOf('{', i); k < src.length; k++) {
  if (src[k] === '{') d++;
  else if (src[k] === '}' && --d === 0) { end = k + 1; break; }
}
const handlerSrc = src.slice(i, end);

let sent = null;
let expoReply = { data: [{ status: 'ok' }] };
const updates = [];
const users = { u1: { pushTokens: { 'ExponentPushToken[aaa]': {}, 'ExponentPushToken[bbb]': {} } } };

const admin = {
  firestore: Object.assign(() => ({
    doc: (path) => ({
      get: async () => ({ data: () => users[path.split('/')[1]] }),
      update: async (u) => { updates.push(u); },
    }),
  }), { FieldValue: { delete: () => '<<DELETE>>' } }),
};
globalThis.fetch = async (url, opts) => {
  sent = JSON.parse(opts.body);
  return { json: async () => expoReply };
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const handler = new Function('admin','console','EXPO_PUSH_URL', `return ${handlerSrc}`)(admin, console, EXPO_PUSH_URL);

const snap = { data: () => ({ type: 'gig_invite', title: 'Gig invite: Friday Set', body: 'Ethan invited you to play.', data: { name: 'Friday Set', date: '2026-09-05' } }) };
const ctx = { params: { uid: 'u1', noteId: 'n1' } };

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// 1 — sends to every registered device
await handler(snap, ctx);
check('one message per token', sent.length, 2);
check('title carried', sent[0].title, 'Gig invite: Friday Set');
check('body carried', sent[0].body, 'Ethan invited you to play.');
check('type in data', sent[0].data.type, 'gig_invite');
check('note data merged', sent[0].data.name, 'Friday Set');
check('noteId included', sent[0].data.noteId, 'n1');
check('nothing pruned on success', updates.length, 0);

// 2 — a dead token is removed, a transient error is not
updates.length = 0;
expoReply = { data: [
  { status: 'error', details: { error: 'DeviceNotRegistered' } },
  { status: 'error', details: { error: 'MessageRateExceeded' } },
]};
await handler(snap, ctx);
check('prunes exactly one token', updates.length, 1);
check('prunes the DEAD one only', Object.keys(updates[0]), ['pushTokens.ExponentPushToken[aaa]']);

// 3 — a user with no devices costs nothing
users.u2 = { pushTokens: {} };
sent = null;
await handler(snap, { params: { uid: 'u2', noteId: 'n2' } });
check('no send when there are no tokens', sent, null);

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail ? 1 : 0);

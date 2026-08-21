// Exercise the real gate from src/lib/askForRating.js with fakes for the
// three things it touches: storage, StoreReview and analytics.
import fs from 'fs';

const src = fs.readFileSync('/Users/ethanlam/prova/src/lib/askForRating.js','utf8');
const body = src
  .replace(/^import .*$/gm, '')
  .replace(/export async function/g, 'async function')
  .replace(/export function/g, 'function');

const mod = await import('data:text/javascript,' + encodeURIComponent(`
  export const store = new Map();
  const AsyncStorage = {
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    setItem: async (k, v) => { store.set(k, String(v)); },
  };
  export const state = { available: true, hasAction: true, requested: 0 };
  const StoreReview = {
    isAvailableAsync: async () => state.available,
    hasAction: async () => state.hasAction,
    requestReview: async () => { state.requested++; },
  };
  export const events = [];
  const track = (n, p) => events.push([n, p]);
  ${body}
  export { maybeAskForRating, markSomethingWentWrong };
`));

const DAY = 86400000;
const reset = () => { mod.store.clear(); mod.state.requested = 0; mod.state.available = true; mod.state.hasAction = true; mod.events.length = 0; };
const oldAccount = new Date(Date.now() - 60 * DAY).toISOString();

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${got}, want ${want})`}`);
};

// 7-day streak on an established account
reset();
check('asks at a 7-day streak', await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount }), true);

// below the trigger
reset();
check('silent at 6 days', await mod.maybeAskForRating({ streak: 6, createdAt: oldAccount }), false);
reset();
check('silent with no streak', await mod.maybeAskForRating({ streak: 0, createdAt: oldAccount }), false);

// brand-new account, even with a streak
reset();
check('silent on a 1-day-old account',
  await mod.maybeAskForRating({ streak: 7, createdAt: new Date(Date.now() - DAY).toISOString() }), false);

// not twice in 90 days
reset();
await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount });
check('silent again the next day', await mod.maybeAskForRating({ streak: 8, createdAt: oldAccount }), false);

// ...but fine after 91
reset();
mod.store.set('prova:rating:lastAsked', String(Date.now() - 91 * DAY));
check('asks again after 91 days', await mod.maybeAskForRating({ streak: 9, createdAt: oldAccount }), true);

// quiet after something failed
reset();
await mod.markSomethingWentWrong();
check('silent right after a failure', await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount }), false);
reset();
mod.store.set('prova:rating:trouble', String(Date.now() - 11 * 60 * 1000));
check('asks 11 min after a failure', await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount }), true);

// user turned review prompts off
reset(); mod.state.hasAction = false;
check('silent when the user disabled prompts', await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount }), false);
reset(); mod.state.available = false;
check('silent where StoreReview is unavailable', await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount }), false);

// missing createdAt shouldn't block a real streak
reset();
check('asks when createdAt is missing', await mod.maybeAskForRating({ streak: 7 }), true);

// the ask is recorded before the sheet, so a crash mid-prompt still counts
reset();
await mod.maybeAskForRating({ streak: 7, createdAt: oldAccount });
check('records the ask', mod.store.has('prova:rating:lastAsked'), true);
check('tracks one event', mod.events.length, 1);

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail ? 1 : 0);

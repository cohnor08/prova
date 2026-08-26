// Offline test for src/lib/starterPlan.js — checks the fallback plan matches
// the same contract the AI plan must satisfy (functions/index.js).
//   node src/lib/__tests__/starterPlan.test.mjs
import fs from 'fs';
const src = fs.readFileSync('/Users/ethanlam/prova/src/lib/starterPlan.js','utf8')
  .replace(/^export /gm,'');
const mod = await import('data:text/javascript,' + encodeURIComponent(src + '\nexport { buildStarterPlan };'));

const DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const CATS=new Set(['warmup','technique','theory','ear_training','repertoire','improvisation']);
let pass=0,fail=0;
const ck=(n,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'ok  ':'FAIL'} ${n}`)};

for (const inst of ['Guitar','Bass'])
for (const lvl of ['Beginner','Novice','Intermediate','Advanced','Elite']) {
  const p = mod.buildStarterPlan({instrument:inst, level:lvl, dailyDuration:45,
    availableDays:['Monday','Wednesday','Friday']});
  const wp = p.weeklyPlan;
  const okDays = DAYS.every(d=>d in wp);
  const onlyChosen = ['monday','wednesday','friday'].every(d=>wp[d]) &&
                     ['tuesday','thursday','saturday','sunday'].every(d=>wp[d]===null);
  const s = wp.monday.sessions;
  const shape = s.every(x=>x.id&&x.title&&x.description&&Number.isFinite(x.duration)&&CATS.has(x.category)&&x.reference);
  const total = s.reduce((n,x)=>n+x.duration,0);
  const nearTarget = Math.abs(total-45)<=4;
  const uniqueIds = new Set(s.map(x=>x.id)).size===s.length;
  if(!(okDays&&onlyChosen&&shape&&nearTarget&&uniqueIds))
    console.log(`   ${inst}/${lvl}: days=${okDays} chosen=${onlyChosen} shape=${shape} total=${total} ids=${uniqueIds}`);
  ck(`${inst} / ${lvl}`, okDays&&onlyChosen&&shape&&nearTarget&&uniqueIds);
}

// edge cases
const noDays = mod.buildStarterPlan({instrument:'Guitar'});
ck('no availableDays → all seven days', DAYS.every(d=>noDays.weeklyPlan[d]));
const tiny = mod.buildStarterPlan({instrument:'Guitar', dailyDuration:5});
ck('5-min target → no block under 3 min', tiny.weeklyPlan.monday.sessions.every(x=>x.duration>=3));
ck('marked as a starter', mod.buildStarterPlan({}).isStarter===true);
ck('bass content really differs', 
  JSON.stringify(mod.buildStarterPlan({instrument:'Bass'})) !== JSON.stringify(mod.buildStarterPlan({instrument:'Guitar'})));

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail?1:0);

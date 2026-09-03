// Catches the web apps falling behind the phone.
//
// web/webapp/index.html re-implements the phone's screens by hand — it shares
// no code with src/. So every time a feature lands on the phone, the web has
// to be rebuilt to match, and nothing notices when it isn't. Four separate
// instances of that drift shipped before this script existed:
//
//   • rows() read `duration` for a teacher task, which stores `durationMin`,
//     so teacher tasks never showed their length
//   • class tasks (classId/className) were mixed in with one-to-one ones
//   • proof of practice (proofs/proofUrl/…) existed only on the phone
//   • the web read the user doc once with getDoc while the phone watched it
//     with onSnapshot, so nothing the phone did ever appeared
//
// Each check below is a FIELD the phone writes or reads, plus the file that
// has to know about it. Both sides are asserted: a field the phone no longer
// uses is reported too, so this list can't quietly rot in either direction.
//
// Adding a field to a shared Firestore shape? Add it here in the same commit.
const fs = require('fs');

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// A field counts as "used" if it appears as `.field` or as a quoted key —
// enough to tell "this file knows about it" from "this file has never heard
// of it", which is the drift being caught. Not an attempt at real analysis.
const uses = (src, field) =>
  new RegExp(`(\\.${field}\\b|['"\`]${field}['"\`])`).test(src);

const PHONE = [
  'src/screens/tabs/TodayScreen.js',   // student side: reads tasks, writes proof
  'src/screens/tabs/TeacherScreen.js', // teacher side: writes tasks
  'src/lib/teacher.js',                // the teacher ↔ student link itself
];
const STUDENT_WEB = 'web/webapp/index.html';
const TEACHER_WEB = 'web/studio/index.html';

// field → which web app has to handle it, and why it matters if it doesn't.
const SHARED = [
  // assignedTasks — the shape a teacher writes and a student reads
  ['durationMin',   STUDENT_WEB, "a teacher task's length (plan sessions use `duration`)"],
  ['dueDate',       STUDENT_WEB, 'when a task is due'],
  ['assignedAt',    STUDENT_WEB, 'when a task was set'],
  ['teacherUid',    STUDENT_WEB, 'which teacher set a task'],
  ['classId',       STUDENT_WEB, 'marks a task as set for a whole class, not one student'],
  // `className` is deliberately NOT checked: it collides with the DOM property
  // of the same name, so the test could never fail and would only look like
  // cover. classId guards the same feature and is unambiguous.
  ['attachments',   STUDENT_WEB, 'photos/videos a teacher attached to a task'],
  ['completed',     STUDENT_WEB, 'whether a task is done'],
  // proof of practice — student writes, teacher reads
  ['proofs',        STUDENT_WEB, 'the list of proof clips on a task'],
  ['proofUrl',      STUDENT_WEB, 'newest proof clip (mirrored for single-clip readers)'],
  ['proofType',     STUDENT_WEB, 'whether a proof clip is video or image'],
  ['proofAt',       STUDENT_WEB, 'when a proof clip was filmed'],
  ['proofVerified', STUDENT_WEB, "the teacher's tick on a proof clip"],
  ['proofUrl',      TEACHER_WEB, 'the teacher has to be able to watch submitted proof'],
  // teacher ↔ student linking
  ['teacherUids',   STUDENT_WEB, 'a student can be linked to SEVERAL teachers'],
  ['teacherCode',   STUDENT_WEB, 'the join code a student enters to link a teacher'],
];

let findings = 0;
const phoneSrc = PHONE.map(read).filter(Boolean).join('\n');
if (!phoneSrc) { console.log('❌ could not read the phone sources'); process.exit(1); }

const webCache = {};
for (const [field, webFile, why] of SHARED) {
  const web = webCache[webFile] ?? (webCache[webFile] = read(webFile));
  if (web === null) { console.log(`❌ missing file: ${webFile}`); findings++; continue; }
  if (!uses(phoneSrc, field)) {
    console.log(`⚠️  ${field}: no longer used by the phone — drop it from scan-web-drift.cjs`);
    findings++;
    continue;
  }
  if (!uses(web, field)) {
    console.log(`❌ ${webFile} never reads \`${field}\` — ${why}`);
    findings++;
  }
}

// The web app must WATCH the user doc, not read it once: the phone writes to
// users/{uid} constantly (useAuth.js keeps a live listener), and a one-shot
// getDoc is why the web app appeared not to sync at all.
const studentWeb = webCache[STUDENT_WEB] ?? read(STUDENT_WEB);
if (studentWeb && !/onSnapshot\(\s*doc\(db,\s*['"]users['"]/.test(studentWeb)) {
  console.log(`❌ ${STUDENT_WEB} has no onSnapshot on users/{uid} — phone changes won't appear until a reload`);
  findings++;
}

console.log(findings === 0
  ? `\n✅ web apps handle all ${SHARED.length} shared fields`
  : `\n❌ ${findings} drift finding(s)`);
process.exit(findings === 0 ? 0 : 1);

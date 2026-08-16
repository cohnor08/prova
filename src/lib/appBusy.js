// A single "don't interrupt me" flag.
//
// Practising with the phone face-down for half an hour is the normal way to
// use Prova, so the idle reload in useStaleReload must never fire while a
// practice session is open — being thrown back to Today mid-task, with the
// seconds since the last checkpoint gone, is a far worse bug than stale data.
//
// A plain module variable rather than context: the reload check lives outside
// the React tree that owns this state, and it only ever needs the latest value.
let busy = false;

export const setAppBusy = (v) => { busy = !!v; };
export const isAppBusy = () => busy;

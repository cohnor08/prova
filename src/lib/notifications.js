// Local practice notifications — all scheduled on-device, no server / push
// tokens needed. Three kinds:
//   1. Daily reminder (repeating, at a time the student picks)
//   2. Streak-saver (one-off this evening, only if they haven't practiced)
//   3. New-task ping (immediate, when their app sees a new teacher task)
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const DAILY_ID = 'prova-daily-reminder';
const STREAK_ID = 'prova-streak-saver';

// Show the banner even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Practice reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (e) { /* ignore */ }
}

// Ask once; returns true if we're allowed to post notifications.
export async function ensureNotificationPermission() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const res = await Notifications.requestPermissionsAsync();
      granted = res.status === 'granted';
    }
    if (granted) await ensureAndroidChannel();
    return granted;
  } catch (e) {
    return false;
  }
}

// "HH:MM" (24h) → { hour, minute }; falls back to 7pm.
export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!m) return { hour: 19, minute: 0 };
  return { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) };
}

export async function scheduleDailyReminder(timeStr) {
  const { hour, minute } = parseTime(timeStr);
  try { await Notifications.cancelScheduledNotificationAsync(DAILY_ID); } catch (e) {}
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: { title: 'Time to practice', body: "Your plan's ready — keep your streak going." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  } catch (e) { /* ignore */ }
}

export async function cancelDailyReminder() {
  try { await Notifications.cancelScheduledNotificationAsync(DAILY_ID); } catch (e) {}
}

// Re-schedule the daily reminder if permission is already granted (never
// prompts — safe to call on app open). A reinstall/new build wipes every
// scheduled notification while Firestore still says reminders are on, so
// without this the reminder silently never fires again after reinstalling.
export async function rearmDailyReminder(timeStr) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await scheduleDailyReminder(timeStr);
  } catch (e) { /* ignore */ }
}

// Fire a test notification a few seconds from now so the user can verify
// banners actually appear (lock the phone after tapping). Returns false when
// permission is denied.
export async function sendTestNotification() {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Prova test', body: 'Notifications are working — see you at practice time.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
    });
    return true;
  } catch (e) {
    return false;
  }
}

// Schedule tonight's streak-saver if there's still time before the cutoff.
export async function scheduleStreakSaver(streak, hour = 20, minute = 30) {
  try { await Notifications.cancelScheduledNotificationAsync(STREAK_ID); } catch (e) {}
  const when = new Date();
  when.setHours(hour, minute, 0, 0);
  if (when.getTime() <= Date.now()) return; // too late to nudge tonight
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_ID,
      content: {
        title: 'Your streak ends at midnight',
        body: `${streak}-day streak on the line — 10 minutes saves it.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  } catch (e) { /* ignore */ }
}

export async function cancelStreakSaver() {
  try { await Notifications.cancelScheduledNotificationAsync(STREAK_ID); } catch (e) {}
}

// Teacher-side ping when assigned task(s) have gone past their due date.
export async function notifyOverdueTasks(items) {
  if (!items || items.length === 0) return;
  try {
    const first = items[0];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task overdue',
        body: items.length === 1
          ? `"${first.title}" — ${first.student} hasn't finished it.`
          : `${items.length} tasks are overdue, starting with "${first.title}" (${first.student}).`,
      },
      trigger: null,
    });
  } catch (e) { /* ignore */ }
}

// Immediate ping when the student's app first sees new teacher task(s).
export async function notifyNewTasks(count) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New task from your teacher',
        body: count > 1 ? `${count} new tasks on your Today screen.` : 'Tap to see what to practice.',
      },
      trigger: null,
    });
  } catch (e) { /* ignore */ }
}

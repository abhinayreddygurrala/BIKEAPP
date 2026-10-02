import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAINTENANCE_TYPE_LABELS, type DueItem } from '@/features/maintenance/maintenanceMath';

// Loaded via require() inside try/catch, not a static import — expo-router
// evaluates every screen's module while building the route tree at startup,
// so a registration failure here would otherwise crash navigation app-wide
// instead of just quietly disabling notifications. See
// src/features/ride-tracking/useLeanAngleTracker.ts for the established
// pattern this follows.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
} catch (e) {
  console.error('[notificationService] expo-notifications native module unavailable', e);
}

const NOTIFIED_KEY = 'odomap.notifiedMaintenanceKeys';

async function getNotifiedKeys(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

async function saveNotifiedKeys(keys: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...keys]));
  } catch {
    // Non-critical — worst case a notification repeats once.
  }
}

async function ensurePermission(): Promise<boolean> {
  if (!Notifications) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Turns "due soon"/"overdue" maintenance items into real local notifications.
 * An immediate one fires once per record+status (deduped in AsyncStorage, so
 * reopening the app doesn't re-notify for the same thing). A due item that
 * also has a calendar date gets a real OS-scheduled notification for that
 * exact day, so it fires even if Odomap isn't open when it comes due.
 */
export async function syncDueNotifications(dueItems: DueItem[], bikeName: string): Promise<void> {
  if (!Notifications) return;
  const relevant = dueItems.filter((item) => item.status === 'overdue' || item.status === 'soon');
  if (relevant.length === 0) return;

  const granted = await ensurePermission();
  if (!granted) return;

  const notified = await getNotifiedKeys();
  let changed = false;

  for (const item of relevant) {
    const label = MAINTENANCE_TYPE_LABELS[item.record.type];

    const immediateKey = `now:${item.record.id}:${item.status}`;
    if (!notified.has(immediateKey)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.status === 'overdue' ? `Overdue: ${label}` : `Due soon: ${label}`,
          body: `${bikeName} — check the Maintenance tab for details.`,
        },
        trigger: null,
      });
      notified.add(immediateKey);
      changed = true;
    }

    if (item.record.next_due_date) {
      const dueDate = new Date(item.record.next_due_date);
      const scheduledKey = `date:${item.record.id}:${item.record.next_due_date}`;
      if (dueDate.getTime() > Date.now() && !notified.has(scheduledKey)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${label} due today`,
            body: `${bikeName} — scheduled for today.`,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueDate },
        });
        notified.add(scheduledKey);
        changed = true;
      }
    }
  }

  if (changed) await saveNotifiedKeys(notified);
}

/** Cancels every maintenance reminder and forgets which ones were sent (used when an account leaves this phone). */
export async function clearMaintenanceNotifications(): Promise<void> {
  if (Notifications) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
  }
  await AsyncStorage.removeItem(NOTIFIED_KEY).catch(() => {});
}

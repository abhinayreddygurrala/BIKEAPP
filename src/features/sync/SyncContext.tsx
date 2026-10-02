import { addDatabaseChangeListener } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthContext';
import { useSettings } from '@/features/settings/SettingsContext';
import { isApiConfigured } from '@/lib/apiClient';

import {
  fetchBackupSummary,
  getLastSyncedAt,
  isPhoneEmpty,
  pushChanges,
  restoreFromCloud,
  switchSyncAccount,
} from './cloudSync';
import { pushMedia, restoreMedia, type MediaResult } from './mediaSync';

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline';

type SyncContextValue = {
  syncState: SyncState;
  lastSyncedAt: string | null;
  /** 'full' when the account's photo space (1 GB) is used up. */
  photoBackup: MediaResult | null;
  /** Downloads the account's data into this phone. Returns how many records came back. */
  restore: () => Promise<number>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

// Saves land in the cloud this long after the last change, so a burst of
// edits (or a whole form) goes up as one quick upload.
const SAVE_DELAY_MS = 4000;
// Offline saves are retried this often (and whenever the app is reopened).
const RETRY_DELAY_MS = 60 * 1000;
// The app's own bookkeeping, and GPS points (sent once the ride is finished).
const IGNORED_TABLES = new Set(['sync_state', 'sync_meta', 'media_state', 'ride_points_local']);

/**
 * Signed in, everything saved on the phone goes to the account's database on
 * the Odomap server automatically, a few seconds after each change — no
 * backup button. The phone's own database still answers every screen
 * instantly and works with no signal; the cloud copy catches up when it can.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuth();
  const { reload: reloadSettings } = useSettings();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [photoBackup, setPhotoBackup] = useState<MediaResult | null>(null);
  const running = useRef<Promise<unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = status === 'signedIn' && !!user && isApiConfigured();

  // One job at a time (saving or restoring); anything else waits its turn.
  const exclusive = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const previous = running.current ?? Promise.resolve();
    const next = previous.catch(() => {}).then(job);
    running.current = next;
    next
      .catch(() => {})
      .finally(() => {
        if (running.current === next) running.current = null;
      });
    return next;
  }, []);

  const save = useCallback(() => {
    if (!enabled) return;
    exclusive(async () => {
      setSyncState('saving');
      // Records first (small and quick), then photos.
      await pushChanges(authedRequest);
      setLastSyncedAt(await getLastSyncedAt());
      setPhotoBackup(await pushMedia(authedRequest));
      setSyncState('saved');
    }).catch((e) => {
      console.warn('[Sync] couldn’t reach the server; retrying later', e);
      setSyncState('offline');
    });
  }, [enabled, authedRequest, exclusive]);

  const saveSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
  }, [save]);

  const restore = useCallback(
    () =>
      exclusive(async () => {
        const count = await restoreFromCloud(authedRequest);
        await reloadSettings();
        setLastSyncedAt(await getLastSyncedAt());
        // Everything shows right away; photos fill in as they download.
        restoreMedia(authedRequest)
          .then((photos) => (photos > 0 ? reloadSettings() : undefined))
          .catch((e) => console.warn('[Sync] photo restore failed (try Restore again later)', e));
        return count;
      }),
    [authedRequest, reloadSettings, exclusive]
  );

  // Every change to the phone's data schedules a save.
  useEffect(() => {
    if (!enabled) return;
    const subscription = addDatabaseChangeListener((event) => {
      if (!IGNORED_TABLES.has(event.tableName)) saveSoon();
    });
    return () => {
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, saveSoon]);

  // Offline (or the server was unreachable): keep trying every minute.
  useEffect(() => {
    if (!enabled || syncState !== 'offline') return;
    const retry = setInterval(save, RETRY_DELAY_MS);
    return () => clearInterval(retry);
  }, [enabled, syncState, save]);

  // Reopening the app catches up anything that couldn't be sent before.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') saveSoon();
    });
    return () => subscription.remove();
  }, [enabled, saveSoon]);

  // On sign-in: a phone with nothing on it offers to bring the account's
  // data back; otherwise everything already on the phone is saved.
  const userId = user?.id;
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    (async () => {
      await switchSyncAccount(userId);
      setLastSyncedAt(await getLastSyncedAt());
      if (cancelled) return;
      try {
        if (await isPhoneEmpty()) {
          const summary = await fetchBackupSummary(authedRequest);
          const rides = summary.counts.rides ?? 0;
          const bikes = summary.counts.bikes ?? 0;
          if (!cancelled && rides + bikes > 0) {
            Alert.alert(
              'Restore your data?',
              `Your account has ${bikes} bike${bikes === 1 ? '' : 's'} and ${rides} ride${rides === 1 ? '' : 's'} saved. Bring them onto this phone?`,
              [
                { text: 'Not Now', style: 'cancel' },
                {
                  text: 'Restore',
                  onPress: () => {
                    restore().catch(() =>
                      Alert.alert('Couldn’t restore', 'Check your connection and try again from Settings.')
                    );
                  },
                },
              ]
            );
            return;
          }
        }
      } catch {
        // Offline: the save below fails quietly and retries.
      }
      if (!cancelled) save();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, authedRequest, restore, save]);

  const value = useMemo<SyncContextValue>(
    () => ({ syncState, lastSyncedAt, photoBackup, restore }),
    [syncState, lastSyncedAt, photoBackup, restore]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}

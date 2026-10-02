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

type SyncContextValue = {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  /** 'full' when the account's photo space (1 GB) is used up. */
  photoBackup: MediaResult | null;
  /** Backs up anything changed. Throws on failure (for the Settings button). */
  backUpNow: () => Promise<void>;
  /** Downloads the account's backup into this phone. Returns how many records came back. */
  restore: () => Promise<number>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

// Opening the app backs up at most this often; leaving it always does.
const FOREGROUND_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Keeps a copy of everything on the phone in the signed-in account, on the
 * Odomap server. Runs on sign-in, when the app opens and when it's left, and
 * from Settings. Signed out (or offline), nothing happens and nothing breaks:
 * the phone's own database is always the source of truth.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuth();
  const { reload: reloadSettings } = useSettings();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [photoBackup, setPhotoBackup] = useState<MediaResult | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const lastAttempt = useRef(0);
  const enabled = status === 'signedIn' && !!user && isApiConfigured();

  // One backup at a time; a second request while one runs just waits for it.
  const backUpNow = useCallback(async () => {
    if (!enabled) return;
    if (running.current) return running.current;
    lastAttempt.current = Date.now();
    setIsSyncing(true);
    running.current = (async () => {
      try {
        // Records first (small and quick), then photos.
        await pushChanges(authedRequest);
        setLastSyncedAt(await getLastSyncedAt());
        setPhotoBackup(await pushMedia(authedRequest));
      } finally {
        running.current = null;
        setIsSyncing(false);
      }
    })();
    return running.current;
  }, [enabled, authedRequest]);

  const backUpQuietly = useCallback(() => {
    backUpNow().catch((e) => console.warn('[Sync] backup failed (will retry later)', e));
  }, [backUpNow]);

  const restore = useCallback(async () => {
    if (running.current) await running.current.catch(() => {});
    setIsSyncing(true);
    try {
      const count = await restoreFromCloud(authedRequest);
      await reloadSettings();
      setLastSyncedAt(await getLastSyncedAt());
      // Everything shows right away; photos fill in as they download.
      restoreMedia(authedRequest)
        .then((photos) => (photos > 0 ? reloadSettings() : undefined))
        .catch((e) => console.warn('[Sync] photo restore failed (try Restore again later)', e));
      return count;
    } finally {
      setIsSyncing(false);
    }
  }, [authedRequest, reloadSettings]);

  // On sign-in: a phone with nothing on it offers to bring the account's
  // backup back; otherwise it just backs up.
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
              `Your account has a backup with ${bikes} bike${bikes === 1 ? '' : 's'} and ${rides} ride${rides === 1 ? '' : 's'}. Bring it onto this phone?`,
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
        // Offline: fall through and try a backup later.
      }
      if (!cancelled) backUpQuietly();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, authedRequest, restore, backUpQuietly]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backUpQuietly();
      if (state === 'active' && Date.now() - lastAttempt.current > FOREGROUND_THROTTLE_MS) backUpQuietly();
    });
    return () => subscription.remove();
  }, [enabled, backUpQuietly]);

  const value = useMemo<SyncContextValue>(
    () => ({ isSyncing, lastSyncedAt, photoBackup, backUpNow, restore }),
    [isSyncing, lastSyncedAt, photoBackup, backUpNow, restore]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}

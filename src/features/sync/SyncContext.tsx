import { addDatabaseChangeListener } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthContext';
import { useSettings } from '@/features/settings/SettingsContext';
import { isApiConfigured } from '@/lib/apiClient';
import { deleteOrphanedBikeData } from '@/services/bikesService';

import { clearAccountDataFromPhone } from './clearPhone';
import {
  fetchBackupSummary,
  getLastSyncedAt,
  getSyncAccount,
  isPhoneEmpty,
  pushChanges,
  restoreFromCloud,
  switchSyncAccount,
} from './cloudSync';
import { pushMedia, restoreMedia, type MediaResult } from './mediaSync';

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline';

/**
 * Signing out was stopped because the account doesn't have everything yet:
 * the server couldn't be reached ('offline'), or photo backup is full or
 * switched off ('photos'). Clearing the phone now would lose that data.
 */
export class UnsavedChangesError extends Error {
  constructor(readonly reason: 'offline' | 'photos') {
    super(reason === 'photos' ? 'Some photos aren’t saved to your account.' : 'Latest changes aren’t saved to your account.');
    this.name = 'UnsavedChangesError';
  }
}

type SyncContextValue = {
  syncState: SyncState;
  lastSyncedAt: string | null;
  /** 'full' when the account's photo space (1 GB) is used up. */
  photoBackup: MediaResult | null;
  /** Downloads the account's data into this phone. Returns how many records came back. */
  restore: () => Promise<number>;
  /** True while a just-signed-in account's data is being brought onto an empty phone. */
  restoringAccount: boolean;
  /**
   * Saves everything to the account, signs out, and clears the account's
   * data from this phone. Throws UnsavedChangesError (still signed in) if the
   * account doesn't have everything, unless `force` is set.
   */
  signOutAndClear: (options?: { force?: boolean }) => Promise<void>;
  /** Deletes the account on the server, then clears its data from this phone. */
  deleteAccountAndClear: (password: string) => Promise<void>;
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
  const { status, user, authedRequest, signOut, deleteAccount } = useAuth();
  const { reload: reloadSettings } = useSettings();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [photoBackup, setPhotoBackup] = useState<MediaResult | null>(null);
  const [restoringAccount, setRestoringAccount] = useState(false);
  const running = useRef<Promise<unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while the phone is being cleared, so no save runs in between.
  const paused = useRef(false);
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
    if (!enabled || paused.current) return;
    exclusive(async () => {
      setSyncState('saving');
      // Leftovers from bikes deleted before a bike's delete took its records
      // with it — removing them here means they leave the backup in this same
      // save. Can't overlap a restore: both run one at a time via exclusive().
      await deleteOrphanedBikeData();
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

  /** Runs `clear` with cloud saving paused, then reloads settings so the profile empties too. */
  const withSavingPaused = useCallback(
    async (clear: () => Promise<void>) => {
      paused.current = true;
      if (timer.current) clearTimeout(timer.current);
      try {
        await clear();
        await reloadSettings();
      } finally {
        paused.current = false;
      }
    },
    [reloadSettings]
  );

  const signOutAndClear = useCallback(
    ({ force = false }: { force?: boolean } = {}) =>
      exclusive(() =>
        withSavingPaused(async () => {
          if (!force) {
            try {
              await pushChanges(authedRequest);
              if ((await pushMedia(authedRequest)) !== 'done') throw new UnsavedChangesError('photos');
            } catch (e) {
              throw e instanceof UnsavedChangesError ? e : new UnsavedChangesError('offline');
            }
          }
          // Signed out first, so nothing can be saved to the account while
          // the phone is cleared.
          await signOut();
          await clearAccountDataFromPhone();
          setLastSyncedAt(null);
          setPhotoBackup(null);
          setSyncState('idle');
        })
      ),
    [exclusive, withSavingPaused, authedRequest, signOut]
  );

  const deleteAccountAndClear = useCallback(
    (password: string) =>
      exclusive(() =>
        withSavingPaused(async () => {
          await deleteAccount(password);
          await clearAccountDataFromPhone();
          setLastSyncedAt(null);
          setPhotoBackup(null);
          setSyncState('idle');
        })
      ),
    [exclusive, withSavingPaused, deleteAccount]
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

  // On sign-in: a phone with nothing on it gets the account's data back
  // straight away; otherwise everything already on the phone is saved.
  const userId = user?.id;
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    (async () => {
      // Data left by a different account (say its session expired) must not
      // be saved into this one: clear it first. Data that was never in any
      // account (from before accounts were required) is kept and saved here.
      const previous = await getSyncAccount();
      if (previous && previous !== userId) await withSavingPaused(clearAccountDataFromPhone);
      await switchSyncAccount(userId);
      setLastSyncedAt(await getLastSyncedAt());
      if (cancelled) return;
      try {
        if (await isPhoneEmpty()) {
          const summary = await fetchBackupSummary(authedRequest);
          const saved = Object.values(summary.counts).reduce((sum, n) => sum + n, 0);
          if (!cancelled && saved > 0) {
            // The app waits on a "bringing back" screen meanwhile, so every
            // screen opens with the restored data already in place.
            setRestoringAccount(true);
            try {
              await restore();
            } catch {
              Alert.alert('Couldn’t bring back your data', 'Check your connection, then use Restore from Account in Settings.');
            } finally {
              setRestoringAccount(false);
            }
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
  }, [enabled, userId, authedRequest, restore, save, withSavingPaused]);

  const value = useMemo<SyncContextValue>(
    () => ({ syncState, lastSyncedAt, photoBackup, restore, restoringAccount, signOutAndClear, deleteAccountAndClear }),
    [syncState, lastSyncedAt, photoBackup, restore, restoringAccount, signOutAndClear, deleteAccountAndClear]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}

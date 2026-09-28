import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Units } from '@/features/ride-tracking/rideMath';
import { getPhotoUri, savePhoto } from '@/lib/localPhotoStorage';
import { getLocalSettings, updateLocalSettings } from './settingsLocalDb';

export type LocalProfile = {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type SettingsContextValue = {
  isLoading: boolean;
  profile: LocalProfile | null;
  units: Units;
  setUnits: (units: Units) => Promise<void>;
  updateProfile: (updates: Partial<Pick<LocalProfile, 'display_name' | 'bio'>>) => Promise<void>;
  setAvatar: (localUri: string) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const AVATAR_ENTITY_ID = 'avatar';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [units, setUnitsState] = useState<Units>('metric');

  useEffect(() => {
    getLocalSettings()
      .then((row) => {
        setProfile({
          display_name: row.display_name,
          bio: row.bio,
          avatar_url: row.avatar_filename ? getPhotoUri('avatar', AVATAR_ENTITY_ID) : null,
        });
        setUnitsState(row.units);
      })
      .catch((e) => console.error('[SettingsProvider] failed to load settings', e))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      isLoading,
      profile,
      units,
      setUnits: async (nextUnits) => {
        setUnitsState(nextUnits);
        await updateLocalSettings({ units: nextUnits });
      },
      updateProfile: async (updates) => {
        setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
        await updateLocalSettings(updates);
      },
      setAvatar: async (localUri) => {
        await savePhoto('avatar', AVATAR_ENTITY_ID, localUri);
        // The filename never changes (always `avatar.jpg`), only its
        // contents — bust the <Image> cache with a query string, same
        // trick the old Supabase-backed avatar URL used.
        const avatarUrl = `${getPhotoUri('avatar', AVATAR_ENTITY_ID)}?updated=${Date.now()}`;
        setProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev));
        await updateLocalSettings({ avatar_filename: `${AVATAR_ENTITY_ID}.jpg` });
      },
    }),
    [isLoading, profile, units]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}

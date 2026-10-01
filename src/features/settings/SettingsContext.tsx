import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import type { Units } from '@/features/ride-tracking/rideMath';
import { deletePhoto, getPhotoUri, savePhoto } from '@/lib/localPhotoStorage';
import { getLocalSettings, updateLocalSettings, type TextScale, type ThemeMode } from './settingsLocalDb';

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
  textScale: TextScale;
  setTextScale: (scale: TextScale) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  updateProfile: (updates: Partial<Pick<LocalProfile, 'display_name' | 'bio'>>) => Promise<void>;
  setAvatar: (localUri: string) => Promise<void>;
  removeAvatar: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const AVATAR_ENTITY_ID = 'avatar';

// 'unspecified' hands control back to the phone's own light/dark setting.
function applyThemeMode(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [units, setUnitsState] = useState<Units>('metric');
  const [textScale, setTextScaleState] = useState<TextScale>(1);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    getLocalSettings()
      .then((row) => {
        // Applied here, before isLoading flips and the splash screen hides,
        // so the first visible frame already has the right theme.
        applyThemeMode(row.theme_mode);
        setProfile({
          display_name: row.display_name,
          bio: row.bio,
          avatar_url: row.avatar_filename ? getPhotoUri('avatar', AVATAR_ENTITY_ID) : null,
        });
        setUnitsState(row.units);
        setTextScaleState(row.text_scale);
        setThemeModeState(row.theme_mode);
      })
      .catch((e) => console.error('[SettingsProvider] failed to load settings', e))
      .finally(() => setIsLoading(false));
  }, []);

  // The setters never read current state, so they're created once and stay
  // the same function forever. Components that hold onto one (like the text
  // size slider's gesture) then never see it change under them.
  const setUnits = useCallback(async (nextUnits: Units) => {
    setUnitsState(nextUnits);
    await updateLocalSettings({ units: nextUnits });
  }, []);

  const setTextScale = useCallback(async (nextScale: TextScale) => {
    setTextScaleState(nextScale);
    await updateLocalSettings({ text_scale: nextScale });
  }, []);

  const setThemeMode = useCallback(async (nextMode: ThemeMode) => {
    applyThemeMode(nextMode);
    setThemeModeState(nextMode);
    await updateLocalSettings({ theme_mode: nextMode });
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Pick<LocalProfile, 'display_name' | 'bio'>>) => {
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    await updateLocalSettings(updates);
  }, []);

  const setAvatar = useCallback(async (localUri: string) => {
    await savePhoto('avatar', AVATAR_ENTITY_ID, localUri);
    // The filename never changes (always `avatar.jpg`), only its
    // contents — bust the <Image> cache with a query string, same
    // trick the old Supabase-backed avatar URL used.
    const avatarUrl = `${getPhotoUri('avatar', AVATAR_ENTITY_ID)}?updated=${Date.now()}`;
    setProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev));
    await updateLocalSettings({ avatar_filename: `${AVATAR_ENTITY_ID}.jpg` });
  }, []);

  const removeAvatar = useCallback(async () => {
    deletePhoto('avatar', AVATAR_ENTITY_ID);
    setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev));
    await updateLocalSettings({ avatar_filename: null });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      isLoading,
      profile,
      units,
      setUnits,
      textScale,
      setTextScale,
      themeMode,
      setThemeMode,
      updateProfile,
      setAvatar,
      removeAvatar,
    }),
    [isLoading, profile, units, setUnits, textScale, setTextScale, themeMode, setThemeMode, updateProfile, setAvatar, removeAvatar]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}

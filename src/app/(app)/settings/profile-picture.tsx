import { useState } from 'react';
import { Alert, Image, StyleSheet, View, type AlertButton } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImagePickerOptions } from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { useTheme } from '@/hooks/use-theme';

// Loaded via require() inside try/catch, not a static import: expo-router
// evaluates every screen's module while building the route tree at startup,
// even ones the user hasn't opened yet, so a throw here (native modules on
// this build have intermittently failed to register at launch — same class
// of issue seen with expo-sensors, unrelated to this specific module) would
// crash navigation app-wide. A dynamic require lets it fail closed: picking
// a photo just shows an error instead.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[ProfilePictureScreen] expo-image-picker native module unavailable', e);
}

const AVATAR_SIZE = 160;

export default function ProfilePictureScreen() {
  const theme = useTheme();
  const { profile, setAvatar, removeAvatar } = useSettings();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayUri = removed ? null : (localUri ?? profile?.avatar_url ?? null);

  const pickFrom = async (source: 'camera' | 'library') => {
    setError(null);
    if (!ImagePicker) {
      setError('Photo picker is unavailable right now — try force-quitting and reopening the app.');
      return;
    }

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is required to take a profile picture.'
          : 'Photo library access is required to set a profile picture.'
      );
      return;
    }

    const options: ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;

    const pickedUri = result.assets[0].uri;
    setLocalUri(pickedUri);
    setRemoved(false);

    setBusy(true);
    try {
      await setAvatar(pickedUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save photo');
      setLocalUri(null);
    } finally {
      setBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    setError(null);
    setRemoved(true);
    setLocalUri(null);
    setBusy(true);
    try {
      await removeAvatar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove photo');
      setRemoved(false);
    } finally {
      setBusy(false);
    }
  };

  const onChangePhoto = () => {
    const buttons: AlertButton[] = [
      { text: 'Take Photo', onPress: () => pickFrom('camera') },
      { text: 'Choose from Library', onPress: () => pickFrom('library') },
    ];
    if (displayUri) {
      buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: onRemovePhoto });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', undefined, buttons);
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <View style={styles.avatarWrap}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} resizeMode="cover" style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="title">🏍️</ThemedText>
            </View>
          )}
        </View>

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger, textAlign: 'center' }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Change Photo" onPress={onChangePhoto} loading={busy} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.four,
    alignItems: 'center',
  },
  avatarWrap: {
    marginBottom: Spacing.two,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

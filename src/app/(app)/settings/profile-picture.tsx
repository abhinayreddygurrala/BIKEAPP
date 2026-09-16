import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { uploadAvatar } from '@/services/profilesService';

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
  const { session, profile, updateProfile } = useAuth();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayUri = localUri ?? profile?.avatar_url ?? null;

  const onChoosePhoto = async () => {
    setError(null);
    if (!ImagePicker) {
      setError('Photo picker is unavailable right now — try force-quitting and reopening the app.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const pickedUri = result.assets[0].uri;
    setLocalUri(pickedUri);

    const userId = session?.user.id;
    if (!userId) return;

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(userId, pickedUri);
      await updateProfile({ avatar_url: publicUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload photo');
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
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

        <PrimaryButton label="Choose Photo" onPress={onChoosePhoto} loading={uploading} />
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

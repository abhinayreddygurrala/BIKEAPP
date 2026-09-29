import type { JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SettingsHeroProps = {
  avatarUri: string | null;
  displayName: string | null;
  bio: string | null;
  bikeCount: number;
  rideCount: number;
  onPressAvatar: () => void;
};

const AVATAR_SIZE = 88;

export function SettingsHero({
  avatarUri,
  displayName,
  bio,
  bikeCount,
  rideCount,
  onPressAvatar,
}: SettingsHeroProps): JSX.Element {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const trimmedName = displayName?.trim();
  const trimmedBio = bio?.trim();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change avatar"
        onPressIn={() => {
          scale.set(withSpring(0.95, { duration: 200, dampingRatio: 1 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { duration: 300, dampingRatio: 0.6 }));
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressAvatar();
        }}>
        <Animated.View style={[styles.avatarWrap, Shadows.glow(theme.accent), avatarStyle]}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              contentFit="cover"
              transition={200}
              style={[styles.avatar, { borderColor: theme.accent }]}
            />
          ) : (
            <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.backgroundElement, borderColor: theme.accent }]}>
              <ThemedText style={styles.placeholderEmoji}>🏍️</ThemedText>
            </View>
          )}
        </Animated.View>
      </Pressable>

      <ThemedText
        type="subtitle"
        themeColor={trimmedName ? undefined : 'textSecondary'}
        style={styles.name}
        numberOfLines={1}>
        {trimmedName || 'Add your name'}
      </ThemedText>

      {trimmedBio ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.bio} numberOfLines={2}>
          {trimmedBio}
        </ThemedText>
      ) : null}

      <View style={styles.statsRow}>
        <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {`🏍️ ${bikeCount} ${bikeCount === 1 ? 'bike' : 'bikes'}`}
          </ThemedText>
        </View>
        <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {`🛣️ ${rideCount} ${rideCount === 1 ? 'ride' : 'rides'}`}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 36,
  },
  name: {
    marginTop: Spacing.three,
    textAlign: 'center',
  },
  bio: {
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  chip: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { distanceUnitLabel, formatDistance, formatDuration, type Units } from '@/features/ride-tracking/rideMath';

export type RideListItemProps = {
  title: string;
  startedAt: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  units: Units;
  pinned?: boolean;
  onPress?: () => void;
  onMenuPress?: () => void;
};

export function RideListItem({
  title,
  startedAt,
  distanceMeters,
  durationSeconds,
  units,
  pinned,
  onPress,
  onMenuPress,
}: RideListItemProps) {
  const date = new Date(startedAt);

  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
            {pinned ? '📌 ' : ''}
            {title}
          </ThemedText>
          {onMenuPress ? (
            <Pressable onPress={onMenuPress} hitSlop={8} style={styles.menuButton}>
              <ThemedText type="default" themeColor="textSecondary">
                ⋯
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </ThemedText>
        <View style={styles.statsRow}>
          <ThemedText type="smallBold">
            {formatDistance(distanceMeters, units)} {distanceUnitLabel(units)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDuration(durationSeconds)}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  menuButton: {
    paddingHorizontal: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
});

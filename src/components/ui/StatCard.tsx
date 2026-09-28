import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type StatCardProps = ViewProps & {
  label: string;
  value: string;
  unit?: string;
  /** Smaller padding/type — for a row of many cards at once (e.g. a summary strip) rather than a couple of headline numbers. */
  compact?: boolean;
};

export function StatCard({ label, value, unit, compact, style, ...rest }: StatCardProps) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, compact && styles.cardCompact, style]}
      {...rest}>
      <ThemedText type="statLabel" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={styles.valueRow}>
        <ThemedText
          type="stat"
          style={compact && styles.valueCompact}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.unit} numberOfLines={1}>
            {unit}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
    flex: 1,
  },
  cardCompact: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  valueCompact: {
    fontSize: 20,
    lineHeight: 24,
  },
  unit: {
    marginBottom: 2,
  },
});

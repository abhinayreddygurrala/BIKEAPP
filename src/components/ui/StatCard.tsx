import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type StatCardProps = ViewProps & {
  label: string;
  value: string;
  unit?: string;
};

export function StatCard({ label, value, unit, style, ...rest }: StatCardProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest}>
      <ThemedText type="statLabel" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.valueRow}>
        <ThemedText type="stat">{value}</ThemedText>
        {unit ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.unit}>
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
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  unit: {
    marginBottom: 2,
  },
});

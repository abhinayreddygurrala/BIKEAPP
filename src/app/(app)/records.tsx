import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import {
  computeAggregateStats,
  computeAllTimeRecords,
  distanceUnitLabel,
  formatDistance,
  formatG,
  formatLeanDeg,
  formatSeconds,
  formatSpeed,
  speedUnitLabel,
} from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { listRides } from '@/services/ridesService';

export default function RecordsScreen() {
  const theme = useTheme();
  const { units } = useSettings();
  const [loaded, setLoaded] = useState(false);
  const [aggregate, setAggregate] = useState(computeAggregateStats([]));
  const [records, setRecords] = useState(computeAllTimeRecords([]));

  const load = useCallback(() => {
    listRides()
      .then((rides) => {
        setAggregate(computeAggregateStats(rides));
        setRecords(computeAllTimeRecords(rides));
      })
      .catch((e) => console.error('[RecordsScreen] failed to load rides', e))
      .finally(() => setLoaded(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!loaded) {
    return (
      <ThemedView style={styles.flex}>
        <ActivityIndicator color={theme.text} style={styles.loading} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Records</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your best-ever numbers across every ride.
          </ThemedText>

          <View style={styles.statsRow}>
            <StatCard label="Total Rides" value={String(aggregate.rideCount)} />
            <StatCard
              label="Total Distance"
              value={formatDistance(aggregate.totalDistanceMeters, units)}
              unit={distanceUnitLabel(units)}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Longest Ride"
              value={formatDistance(aggregate.longestRideMeters, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard
              label="Avg Trip Length"
              value={formatDistance(aggregate.avgTripLengthMeters, units)}
              unit={distanceUnitLabel(units)}
            />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Curve Records
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Total Curves" value={String(records.totalCurves)} />
            <StatCard label="Peak Lateral G" value={formatG(records.peakLateralG)} unit="g" />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Fastest Left"
              value={formatSpeed(records.fastestLeftKmh, units)}
              unit={speedUnitLabel(units)}
            />
            <StatCard
              label="Fastest Right"
              value={formatSpeed(records.fastestRightKmh, units)}
              unit={speedUnitLabel(units)}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Steepest Left" value={formatLeanDeg(records.steepestLeftDeg)} unit="deg" />
            <StatCard label="Steepest Right" value={formatLeanDeg(records.steepestRightDeg)} unit="deg" />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Longest Left"
              value={formatDistance(records.longestLeftM, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard
              label="Longest Right"
              value={formatDistance(records.longestRightM, units)}
              unit={distanceUnitLabel(units)}
            />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Acceleration Runs
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="From Stop · 0-60 mph" value={formatSeconds(records.best0To60Seconds)} unit="s" />
            <StatCard label="From Stop · 0-100 mph" value={formatSeconds(records.best0To100Seconds)} unit="s" />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="From Stop · 0-150 mph" value={formatSeconds(records.best0To150Seconds)} unit="s" />
            <StatCard label="Rolling · 60-130 mph" value={formatSeconds(records.bestRolling60To130Seconds)} unit="s" />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Drag · 1/8 mi"
              value={formatSeconds(records.bestDragEighthMileSeconds)}
              unit="s"
            />
            <StatCard
              label="Drag · 1/4 mi"
              value={formatSeconds(records.bestDragQuarterMileSeconds)}
              unit="s"
            />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Wheelies
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Total Wheelies" value={String(records.totalWheelies)} />
            <StatCard label="Longest Wheelie" value={formatSeconds(records.longestWheelieSeconds)} unit="s" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.four,
  },
});

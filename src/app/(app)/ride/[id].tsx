import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { RouteMap } from '@/components/map/RouteMap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import {
  decodeRoutePolyline,
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatG,
  formatLeanDeg,
  formatSeconds,
  formatSpeed,
  speedUnitLabel,
} from '@/features/ride-tracking/rideMath';
import { promptTogglePin, showPinLimitAlert } from '@/features/ride-tracking/pinRideAlerts';
import { useTheme } from '@/hooks/use-theme';
import { shareRide } from '@/services/shareService';
import { getRideDetail, PinLimitError, setRidePinned, type RideSummary } from '@/services/ridesService';

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();
  const [ride, setRide] = useState<RideSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const onShare = async () => {
    if (!ride) return;
    setSharing(true);
    try {
      await shareRide(ride, units);
    } catch (e) {
      console.error('[RideDetailScreen] failed to share ride', e);
    } finally {
      setSharing(false);
    }
  };

  const onMenuPress = () => {
    if (!ride) return;
    promptTogglePin(ride.pinned === 1, async () => {
      if (!ride) return;
      const nextPinned = ride.pinned === 1 ? 0 : 1;
      const previous = ride.pinned;
      setRide({ ...ride, pinned: nextPinned });
      try {
        await setRidePinned(ride.id, nextPinned === 1);
      } catch (e) {
        setRide((r) => (r ? { ...r, pinned: previous } : r));
        if (e instanceof PinLimitError) {
          showPinLimitAlert();
        } else {
          console.error('[RideDetailScreen] failed to toggle pin', e);
        }
      }
    });
  };

  useEffect(() => {
    if (!id) return;
    getRideDetail(id)
      .then(setRide)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ride'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (error || !ride) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          {error ?? 'Ride not found.'}
        </ThemedText>
      </ThemedView>
    );
  }

  const coordinates = ride.route_polyline ? decodeRoutePolyline(ride.route_polyline) : [];
  const fallbackTitle =
    new Date(ride.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/(app)/ride/edit', params: { id } })} hitSlop={8}>
              <ThemedText type="default" style={{ color: theme.accent }}>
                Edit
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {coordinates.length > 0 ? (
          <RouteMap coordinates={coordinates} fitOnChange style={styles.map} />
        ) : (
          <ThemedView type="backgroundElement" style={styles.noRoute}>
            <ThemedText type="default" themeColor="textSecondary">
              No route recorded
            </ThemedText>
          </ThemedView>
        )}

        <View style={styles.statsPanel}>
          <View style={styles.titleRow}>
            <View style={styles.titleColumn}>
              <ThemedText type="smallBold">
                {ride.pinned === 1 ? '📌 ' : ''}
                {ride.title ?? fallbackTitle}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(ride.started_at).toLocaleString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </ThemedText>
            </View>
            <Pressable onPress={onMenuPress} hitSlop={8} style={styles.menuButton}>
              <ThemedText type="title" themeColor="textSecondary">
                ⋯
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Distance"
              value={formatDistance(ride.distance_meters, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard label="Duration" value={formatDuration(ride.duration_seconds)} />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Avg Speed"
              value={formatSpeed(ride.avg_speed_kmh, units)}
              unit={speedUnitLabel(units)}
            />
            <StatCard
              label="Max Speed"
              value={formatSpeed(ride.max_speed_kmh, units)}
              unit={speedUnitLabel(units)}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Max Lean" value={formatLeanDeg(ride.lean_max_deg)} unit="deg" />
            <StatCard label="Avg Lean" value={formatLeanDeg(ride.lean_avg_deg)} unit="deg" />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Stopped Time" value={formatDuration(ride.stopped_seconds)} />
            <StatCard label="Peak Lateral G" value={formatG(ride.peak_lateral_g)} unit="g" />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Curve Records
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Curves" value={String(ride.curve_count ?? 0)} />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Fastest Left"
              value={formatSpeed(ride.fastest_curve_left_kmh, units)}
              unit={speedUnitLabel(units)}
            />
            <StatCard
              label="Fastest Right"
              value={formatSpeed(ride.fastest_curve_right_kmh, units)}
              unit={speedUnitLabel(units)}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Steepest Left" value={formatLeanDeg(ride.steepest_lean_left_deg)} unit="deg" />
            <StatCard label="Steepest Right" value={formatLeanDeg(ride.steepest_lean_right_deg)} unit="deg" />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Longest Left"
              value={formatDistance(ride.longest_curve_left_m, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard
              label="Longest Right"
              value={formatDistance(ride.longest_curve_right_m, units)}
              unit={distanceUnitLabel(units)}
            />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Acceleration Runs
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            From stop and Drag only count if you start from a complete stop.
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="From Stop · 0-60 mph" value={formatSeconds(ride.accel_0_60_seconds)} unit="s" />
            <StatCard label="From Stop · 0-100 mph" value={formatSeconds(ride.accel_0_100_seconds)} unit="s" />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="From Stop · 0-150 mph" value={formatSeconds(ride.accel_0_150_seconds)} unit="s" />
            <StatCard label="Rolling · 60-130 mph" value={formatSeconds(ride.rolling_60_130_seconds)} unit="s" />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Drag · From Stop · 1/8 mi"
              value={formatSeconds(ride.drag_eighth_mile_seconds)}
              unit="s"
            />
            <StatCard
              label="Drag · From Stop · 1/4 mi"
              value={formatSeconds(ride.drag_quarter_mile_seconds)}
              unit="s"
            />
          </View>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Wheelies
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Count" value={String(ride.wheelie_count ?? 0)} />
            <StatCard label="Longest" value={formatSeconds(ride.longest_wheelie_seconds)} unit="s" />
          </View>

          <PrimaryButton
            label="Share This Ride"
            variant="muted"
            onPress={onShare}
            loading={sharing}
            style={styles.sectionLabel}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  titleColumn: {
    flex: 1,
    gap: Spacing.one,
  },
  menuButton: {
    paddingHorizontal: Spacing.one,
    marginTop: -Spacing.one,
  },
  scrollContent: {
    flexGrow: 1,
  },
  map: {
    height: 320,
  },
  noRoute: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsPanel: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
});

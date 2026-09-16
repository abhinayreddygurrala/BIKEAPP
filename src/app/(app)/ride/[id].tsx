import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { RouteMap } from '@/components/map/RouteMap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import {
  decodeRoutePolyline,
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatLeanDeg,
  formatSpeed,
  speedUnitLabel,
} from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { getRideDetail, type RideSummary } from '@/services/ridesService';

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useAuth();
  const theme = useTheme();
  const [ride, setRide] = useState<RideSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <ActivityIndicator color="#fff" />
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
          <ThemedText type="smallBold">{ride.title ?? fallbackTitle}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(ride.started_at).toLocaleString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </ThemedText>
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
});

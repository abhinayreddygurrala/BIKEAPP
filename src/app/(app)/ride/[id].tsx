import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RouteMap } from '@/components/map/RouteMap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { decodeRoutePolyline, formatDistanceKm, formatDuration, formatSpeedKmh } from '@/features/ride-tracking/rideMath';
import { getRideDetail, type RideSummary } from '@/services/ridesService';

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  return (
    <ThemedView style={styles.flex}>
      <RouteMap coordinates={coordinates} fitOnChange style={styles.map} />

      <View style={styles.statsPanel}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {new Date(ride.started_at).toLocaleString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </ThemedText>
        <View style={styles.statsRow}>
          <StatCard label="Distance" value={formatDistanceKm(ride.distance_meters)} unit="km" />
          <StatCard label="Duration" value={formatDuration(ride.duration_seconds)} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Avg Speed" value={formatSpeedKmh(ride.avg_speed_kmh)} unit="km/h" />
          <StatCard label="Max Speed" value={formatSpeedKmh(ride.max_speed_kmh)} unit="km/h" />
        </View>
      </View>
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
  map: {
    flex: 1.2,
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

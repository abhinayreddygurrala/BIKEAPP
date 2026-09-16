import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { RideListItem } from '@/components/ride/RideListItem';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { computeAggregateStats, distanceUnitLabel, formatDistance, formatDuration } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';
import { listRides, syncPendingRides, type RideSummary } from '@/services/ridesService';

export default function RidesScreen() {
  const { units } = useAuth();
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [bikeFilter, setBikeFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      await syncPendingRides();
    } catch {
      // Offline or sync failed — local rides still show below, marked pending.
    }
    try {
      const [ridesResult, bikesResult] = await Promise.all([listRides(), listBikes()]);
      setRides(ridesResult);
      setBikes(bikesResult);
    } catch (e) {
      console.error('[RidesScreen] failed to load rides', e);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Refetch on every focus, not just first mount — tab screens stay mounted
  // in the background, so without this, deleting/editing a bike or ride
  // elsewhere would leave this screen showing stale data until a manual
  // pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredRides = useMemo(
    () => (bikeFilter ? rides.filter((r) => r.bike_id === bikeFilter) : rides),
    [rides, bikeFilter]
  );
  const summary = useMemo(() => computeAggregateStats(filteredRides), [filteredRides]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Rides
        </ThemedText>

        {bikes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <FilterChip label="All Bikes" selected={bikeFilter === null} onPress={() => setBikeFilter(null)} />
            {bikes.map((bike) => (
              <FilterChip
                key={bike.id}
                label={bike.name}
                selected={bikeFilter === bike.id}
                onPress={() => setBikeFilter(bike.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {loaded && rides.length > 0 ? (
          <View style={styles.summaryRow}>
            <StatCard label="Rides" value={String(summary.rideCount)} />
            <StatCard
              label="Distance"
              value={formatDistance(summary.totalDistanceMeters, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard label="Time" value={formatDuration(summary.totalDurationSeconds)} />
          </View>
        ) : null}

        {!loaded ? (
          <ActivityIndicator color="#fff" style={styles.loading} />
        ) : (
          <FlatList
            data={filteredRides}
            keyExtractor={(item) => item.id}
            contentContainerStyle={filteredRides.length === 0 ? styles.emptyList : styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
            renderItem={({ item }) => (
              <RideListItem
                title={item.title ?? new Date(item.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride'}
                startedAt={item.started_at}
                distanceMeters={item.distance_meters}
                durationSeconds={item.duration_seconds}
                units={units}
                pendingSync={item.source === 'local' && !item.synced}
                onPress={() => router.push({ pathname: '/(app)/ride/[id]', params: { id: item.id } })}
              />
            )}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                {bikeFilter ? 'No rides on this bike yet.' : 'No rides recorded yet.'}
              </ThemedText>
            }
          />
        )}

        <Link href="/(app)/ride/record" asChild>
          <PrimaryButton label="Start Ride" />
        </Link>
        <Link href="/(app)/ride/new" asChild>
          <PrimaryButton label="Log Past Ride" variant="muted" />
        </Link>
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
      <ThemedText type="small" style={{ color: selected ? theme.accentText : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  filterScroll: {
    flexGrow: 0,
  },
  chip: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginRight: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
});

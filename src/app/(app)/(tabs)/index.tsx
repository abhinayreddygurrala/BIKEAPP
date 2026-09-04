import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RideListItem } from '@/components/ride/RideListItem';
import { Spacing } from '@/constants/theme';
import { listRides, syncPendingRides, type RideSummary } from '@/services/ridesService';

export default function RidesScreen() {
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      await syncPendingRides();
    } catch {
      // Offline or sync failed — local rides still show below, marked pending.
    }
    try {
      setRides(await listRides());
    } catch (e) {
      console.error('[RidesScreen] failed to load rides', e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // load() also backs pull-to-refresh, so it can't be inlined here — the
    // set-state-in-effect rule can't see that its setState calls all happen
    // after an await, not synchronously during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Rides
        </ThemedText>

        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={rides.length === 0 ? styles.emptyList : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          renderItem={({ item }) => (
            <RideListItem
              title={item.title ?? new Date(item.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride'}
              startedAt={item.started_at}
              distanceMeters={item.distance_meters}
              durationSeconds={item.duration_seconds}
              pendingSync={item.source === 'local' && !item.synced}
              onPress={() => router.push({ pathname: '/(app)/ride/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            loaded ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                No rides recorded yet.
              </ThemedText>
            ) : null
          }
        />

        <Link href="/(app)/ride/record" asChild>
          <PrimaryButton label="Start Ride" />
        </Link>
      </SafeAreaView>
    </ThemedView>
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
});

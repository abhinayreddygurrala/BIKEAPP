import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingActions } from '@/components/ui/FloatingActions';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { RideListItem } from '@/components/ride/RideListItem';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { computeAggregateStats, distanceUnitLabel, formatDistance, formatDuration } from '@/features/ride-tracking/rideMath';
import { promptTogglePin, showPinLimitAlert } from '@/features/ride-tracking/pinRideAlerts';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';
import { listRides, PinLimitError, setRidePinned, type RideSummary } from '@/services/ridesService';

export default function RidesScreen() {
  const theme = useTheme();
  const { units } = useSettings();
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [bikeFilter, setBikeFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Measured height of the floating Start/Log buttons, so the list knows how
  // much room to leave at its end.
  const [actionsHeight, setActionsHeight] = useState(0);

  const load = useCallback(async () => {
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

  const onRideMenuPress = useCallback(
    (ride: RideSummary) => {
      promptTogglePin(ride.pinned === 1, async () => {
        try {
          await setRidePinned(ride.id, ride.pinned !== 1);
          await load();
        } catch (e) {
          if (e instanceof PinLimitError) {
            showPinLimitAlert();
          } else {
            console.error('[RidesScreen] failed to toggle pin', e);
          }
        }
      });
    },
    [load]
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText type="title" style={styles.title}>
              Rides
            </ThemedText>
            <Pressable onPress={() => router.push('/(app)/records')} hitSlop={8}>
              <ThemedText type="default" themeColor="accent">
                🏆 Records
              </ThemedText>
            </Pressable>
          </View>

          {bikes.length > 0 ? (
            // Runs edge to edge (the negative margin cancels the screen's side
            // padding) so chips scroll off the real screen edge instead of
            // being chopped mid-word at an invisible line inside it.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterContent}>
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
              <StatCard compact label="Rides" value={String(summary.rideCount)} />
              <StatCard
                compact
                label="Distance"
                value={formatDistance(summary.totalDistanceMeters, units)}
                unit={distanceUnitLabel(units)}
              />
              <StatCard compact label="Time" value={formatDuration(summary.totalDurationSeconds)} />
            </View>
          ) : null}
        </View>

        <View style={styles.listArea}>
          {!loaded ? (
            <ActivityIndicator color={theme.text} style={styles.loading} />
          ) : (
            // Fills the screen to the bottom edge, underneath the floating
            // buttons below — rides fade out beneath them instead of being cut
            // off on a hard line. The bottom padding (the buttons' own height)
            // lets the last ride scroll fully clear of them.
            <FlatList
              data={filteredRides}
              keyExtractor={(item) => item.id}
              style={styles.flex}
              contentContainerStyle={[
                filteredRides.length === 0 ? styles.emptyList : styles.list,
                { paddingBottom: actionsHeight + Spacing.two },
              ]}
              scrollIndicatorInsets={{ bottom: actionsHeight }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}
              renderItem={({ item }) => (
                <RideListItem
                  title={
                    item.title ?? new Date(item.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride'
                  }
                  startedAt={item.started_at}
                  distanceMeters={item.distance_meters}
                  durationSeconds={item.duration_seconds}
                  units={units}
                  pinned={item.pinned === 1}
                  onPress={() => router.push({ pathname: '/(app)/ride/[id]', params: { id: item.id } })}
                  onMenuPress={() => onRideMenuPress(item)}
                />
              )}
              ListEmptyComponent={
                <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                  {bikeFilter ? 'No rides on this bike yet.' : 'No rides recorded yet.'}
                </ThemedText>
              }
            />
          )}

          <FloatingActions onHeightChange={setActionsHeight}>
            <Link href="/(app)/ride/record" asChild>
              <PrimaryButton label="Start Ride" />
            </Link>
            <Link href="/(app)/ride/new" asChild>
              <PrimaryButton label="Log Past Ride" variant="muted" />
            </Link>
          </FloatingActions>
        </View>
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
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  title: {},
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginHorizontal: -Spacing.four,
  },
  filterContent: {
    paddingHorizontal: Spacing.four,
  },
  listArea: {
    flex: 1,
    marginTop: Spacing.two,
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
  // Side padding lives inside the list (not around it) so card shadows have
  // room and aren't sliced off at the list's edges.
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
});

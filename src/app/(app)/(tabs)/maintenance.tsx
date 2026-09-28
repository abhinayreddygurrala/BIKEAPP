import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Shadows, Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';
import { listFuelLogs, type FuelLog } from '@/services/fuelService';
import { listMaintenanceRecords, type MaintenanceRecord } from '@/services/maintenanceService';

const TYPE_LABELS: Record<MaintenanceRecord['type'], string> = {
  oil_change: 'Oil Change',
  chain: 'Chain',
  tires: 'Tires',
  brake_pads: 'Brake Pads',
  service: 'Service',
  other: 'Other',
};

const ADD_BUTTON_SIZE = 32;

// A compact, accent-colored icon button — reads as a clear "add" action
// next to a section label, unlike a full muted pill which blends into
// the background.
function AddButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addButton,
        { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
        Shadows.glow(theme.accent),
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.accentText }}>
        +
      </ThemedText>
    </Pressable>
  );
}

export default function MaintenanceScreen() {
  const { units } = useSettings();
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadBikes = useCallback(() => {
    listBikes()
      .then(setBikes)
      .catch((e) => console.error('[MaintenanceScreen] failed to load bikes', e))
      .finally(() => setLoaded(true));
  }, []);

  const loadRecords = useCallback((bikeId: string) => {
    Promise.all([listMaintenanceRecords(bikeId), listFuelLogs(bikeId)])
      .then(([recordsResult, fuelResult]) => {
        setRecords(recordsResult);
        setFuelLogs(fuelResult);
      })
      .catch((e) => console.error('[MaintenanceScreen] failed to load records', e));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBikes();
      if (selectedBikeId) loadRecords(selectedBikeId);
      // Only re-run on focus/bike-change, not every time loadRecords is recreated.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadBikes, selectedBikeId])
  );

  const selectedBike = bikes.find((b) => b.id === selectedBikeId) ?? null;

  if (!loaded) {
    return (
      <ThemedView style={styles.flex}>
        <ActivityIndicator color="#fff" style={styles.loading} />
      </ThemedView>
    );
  }

  if (!selectedBike) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="title">Maintenance</ThemedText>
          {bikes.length === 0 ? (
            <>
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                Add a bike first to start tracking its maintenance and fuel history.
              </ThemedText>
              <Link href="/(app)/bikes/new" asChild>
                <PrimaryButton label="🏍️ Add Bike" />
              </Link>
            </>
          ) : (
            <>
              <ThemedText type="default" themeColor="textSecondary">
                Which bike?
              </ThemedText>
              <FlatList
                data={bikes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <Pressable onPress={() => setSelectedBikeId(item.id)}>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="smallBold">🏍️ {item.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[item.make, item.model, item.year].filter(Boolean).join(' · ') || 'No details yet'}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                )}
              />
            </>
          )}
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <Pressable onPress={() => setSelectedBikeId(null)}>
          <ThemedText type="link" themeColor="accent">
            ← Bikes
          </ThemedText>
        </Pressable>
        <ThemedText type="title">🏍️ {selectedBike.name}</ThemedText>

        <FlatList
          data={[{ kind: 'header' as const }]}
          keyExtractor={() => 'body'}
          contentContainerStyle={styles.list}
          renderItem={() => (
            <View style={styles.sections}>
              <View style={styles.sectionHeader}>
                <ThemedText type="statLabel" themeColor="textSecondary">
                  Service History
                </ThemedText>
                <AddButton
                  onPress={() =>
                    router.push({ pathname: '/(app)/maintenance/new-service', params: { bikeId: selectedBike.id } })
                  }
                />
              </View>
              {records.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No service logged yet.
                </ThemedText>
              ) : (
                records.map((record) => (
                  <ThemedView key={record.id} type="backgroundElement" style={styles.card}>
                    <ThemedText type="smallBold">{TYPE_LABELS[record.type]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {new Date(record.performed_at).toLocaleDateString()}
                      {record.odometer_km != null
                        ? ` · ${formatDistance(record.odometer_km * 1000, units)} ${distanceUnitLabel(units)}`
                        : ''}
                      {record.cost != null ? ` · $${record.cost.toFixed(2)}` : ''}
                    </ThemedText>
                    {record.notes ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {record.notes}
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                ))
              )}

              <View style={[styles.sectionHeader, styles.sectionSpacing]}>
                <ThemedText type="statLabel" themeColor="textSecondary">
                  Fuel Log
                </ThemedText>
                <AddButton
                  onPress={() =>
                    router.push({ pathname: '/(app)/maintenance/new-fuel', params: { bikeId: selectedBike.id } })
                  }
                />
              </View>
              {fuelLogs.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No fill-ups logged yet.
                </ThemedText>
              ) : (
                fuelLogs.map((log) => (
                  <ThemedView key={log.id} type="backgroundElement" style={styles.card}>
                    <ThemedText type="smallBold">
                      {new Date(log.filled_at).toLocaleDateString()} {log.full_tank ? '· Full tank' : '· Partial'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {log.liters != null ? `${log.liters}L` : ''}
                      {log.cost != null ? ` · $${log.cost.toFixed(2)}` : ''}
                    </ThemedText>
                    {log.distance_since_last_full_km != null ? (
                      <ThemedText type="small" themeColor="accent">
                        {formatDistance(log.distance_since_last_full_km * 1000, units)} {distanceUnitLabel(units)} since your last full tank
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                ))
              )}
            </View>
          )}
        />
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
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  sections: {
    gap: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionSpacing: {
    marginTop: Spacing.four,
  },
  addButton: {
    width: ADD_BUTTON_SIZE,
    height: ADD_BUTTON_SIZE,
    borderRadius: ADD_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

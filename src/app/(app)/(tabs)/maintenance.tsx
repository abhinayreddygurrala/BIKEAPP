import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Shadows, Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import {
  computeMaintenanceStats,
  EXPENSE_CATEGORY_LABELS,
  formatCostPerDistance,
  formatFuelEconomy,
  formatVolume,
  getDueItems,
  getSuggestedIntervals,
  MAINTENANCE_TYPE_LABELS,
  volumeUnitLabel,
  type DueItem,
  type SuggestedInterval,
} from '@/features/maintenance/maintenanceMath';
import { distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';
import { listExpenses, type Expense } from '@/services/expenseService';
import { listFuelLogs, type FuelLog } from '@/services/fuelService';
import { listMaintenanceRecords, type MaintenanceRecord } from '@/services/maintenanceService';
import { syncDueNotifications } from '@/services/notificationService';

const DUE_STATUS_LABEL: Record<DueItem['status'], string> = {
  overdue: 'Overdue',
  soon: 'Due Soon',
  upcoming: 'Upcoming',
};

const TYPE_LABELS = MAINTENANCE_TYPE_LABELS;

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

function describeDue(item: DueItem, units: 'metric' | 'imperial'): string {
  const parts: string[] = [];
  if (item.odometerRemainingKm != null) {
    const dist = formatDistance(Math.abs(item.odometerRemainingKm) * 1000, units);
    const unit = distanceUnitLabel(units);
    parts.push(item.odometerRemainingKm <= 0 ? `${dist} ${unit} overdue` : `${dist} ${unit} away`);
  }
  if (item.record.next_due_date) {
    const dateLabel = new Date(item.record.next_due_date).toLocaleDateString();
    parts.push(item.daysRemaining != null && item.daysRemaining <= 0 ? `was due ${dateLabel}` : `due ${dateLabel}`);
  }
  return parts.join(' · ');
}

export default function MaintenanceScreen() {
  const { units } = useSettings();
  const theme = useTheme();
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadBikes = useCallback(() => {
    listBikes()
      .then(setBikes)
      .catch((e) => console.error('[MaintenanceScreen] failed to load bikes', e))
      .finally(() => setLoaded(true));
  }, []);

  const loadRecords = useCallback((bikeId: string) => {
    Promise.all([listMaintenanceRecords(bikeId), listFuelLogs(bikeId), listExpenses(bikeId)])
      .then(([recordsResult, fuelResult, expensesResult]) => {
        setRecords(recordsResult);
        setFuelLogs(fuelResult);
        setExpenses(expensesResult);
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

  const stats = computeMaintenanceStats(records, fuelLogs, expenses);
  const fuelEconomy = formatFuelEconomy(stats.fuelEconomyKmPerLiter, units);
  const costPerDistance = formatCostPerDistance(stats.costPerKm, units);
  const knownOdometerReadings = [
    selectedBike?.current_odometer_km ?? null,
    ...records.map((r) => r.odometer_km),
    ...fuelLogs.map((f) => f.odometer_km),
  ].filter((v): v is number => v != null);
  const currentOdometerKm = knownOdometerReadings.length ? Math.max(...knownOdometerReadings) : null;
  const dueItems = getDueItems(records, currentOdometerKm);
  const suggestedIntervals = getSuggestedIntervals(records, currentOdometerKm);

  useEffect(() => {
    if (!selectedBike) return;
    syncDueNotifications(dueItems, selectedBike.name).catch((e) =>
      console.error('[MaintenanceScreen] notification sync failed', e)
    );
    // dueItems is recomputed fresh every render from records/currentOdometerKm
    // — keying on those instead avoids re-running on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, selectedBike?.id, currentOdometerKm]);

  if (!loaded) {
    return (
      <ThemedView style={styles.flex}>
        <ActivityIndicator color={theme.text} style={styles.loading} />
      </ThemedView>
    );
  }

  if (!selectedBike) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.content} edges={['top']}>
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
                style={styles.fullBleed}
                contentInsetAdjustmentBehavior="automatic"
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
      <SafeAreaView style={styles.content} edges={['top']}>
        <Pressable onPress={() => setSelectedBikeId(null)}>
          <ThemedText type="link" themeColor="accent">
            ← Bikes
          </ThemedText>
        </Pressable>
        <ThemedText type="title">🏍️ {selectedBike.name}</ThemedText>

        {records.length > 0 || fuelLogs.length > 0 || expenses.length > 0 ? (
          <View style={styles.statsRow}>
            <StatCard label="Total Spent" value={`$${stats.totalSpent.toFixed(2)}`} compact />
            {costPerDistance ? (
              <StatCard label={`Cost/${distanceUnitLabel(units)}`} value={costPerDistance} compact />
            ) : null}
            {fuelEconomy ? <StatCard label="Fuel Economy" value={fuelEconomy.value} unit={fuelEconomy.unit} compact /> : null}
          </View>
        ) : null}

        <FlatList
          data={[{ kind: 'header' as const }]}
          keyExtractor={() => 'body'}
          style={styles.fullBleed}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          renderItem={() => (
            <View style={styles.sections}>
              {dueItems.length > 0 ? (
                <View style={styles.dueSection}>
                  <ThemedText type="statLabel" themeColor="textSecondary">
                    Upcoming
                  </ThemedText>
                  {dueItems.map((item) => (
                    <Pressable
                      key={item.record.id}
                      onPress={() =>
                        router.push({ pathname: '/(app)/maintenance/edit-service', params: { id: item.record.id } })
                      }>
                      <ThemedView type="backgroundElement" style={styles.card}>
                        <View style={styles.dueRow}>
                          <ThemedText type="smallBold">{TYPE_LABELS[item.record.type]}</ThemedText>
                          <View style={styles.cardHeaderRight}>
                            <ThemedText
                              type="small"
                              style={{
                                color:
                                  item.status === 'overdue'
                                    ? theme.danger
                                    : item.status === 'soon'
                                      ? theme.accent
                                      : theme.textSecondary,
                              }}>
                              {DUE_STATUS_LABEL[item.status]}
                            </ThemedText>
                            <ThemedText type="default" themeColor="textSecondary">
                              ›
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">
                          {describeDue(item, units)}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {suggestedIntervals.length > 0 ? (
                <View style={styles.dueSection}>
                  <ThemedText type="statLabel" themeColor="textSecondary">
                    Suggested
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.suggestedHint}>
                    General rule of thumb — not based on your bike specifically.
                  </ThemedText>
                  {suggestedIntervals.map((item: SuggestedInterval) => (
                    <Pressable
                      key={item.type}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/maintenance/new-service',
                          params: { bikeId: selectedBike.id, type: item.type },
                        })
                      }>
                      <ThemedView type="backgroundElement" style={[styles.card, styles.suggestedCard]}>
                        <View style={styles.dueRow}>
                          <ThemedText type="smallBold">{TYPE_LABELS[item.type]}</ThemedText>
                          <ThemedText type="default" themeColor="textSecondary">
                            ›
                          </ThemedText>
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDistance(item.suggestedAtKm * 1000, units)} {distanceUnitLabel(units)} · never logged
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              ) : null}

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
                  <Pressable
                    key={record.id}
                    onPress={() => router.push({ pathname: '/(app)/maintenance/edit-service', params: { id: record.id } })}>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <ThemedText type="smallBold">{TYPE_LABELS[record.type]}</ThemedText>
                        <View style={styles.cardHeaderRight}>
                          {record.attachments.length > 0 ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              📎 {record.attachments.length}
                            </ThemedText>
                          ) : null}
                          <ThemedText type="default" themeColor="textSecondary">
                            ›
                          </ThemedText>
                        </View>
                      </View>
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
                  </Pressable>
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
                  <Pressable
                    key={log.id}
                    onPress={() => router.push({ pathname: '/(app)/maintenance/edit-fuel', params: { id: log.id } })}>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <ThemedText type="smallBold">
                        {new Date(log.filled_at).toLocaleDateString()} {log.full_tank ? '· Full tank' : '· Partial'}
                      </ThemedText>
                      <ThemedText type="default" themeColor="textSecondary">
                        ›
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {log.liters != null ? `${formatVolume(log.liters, units)} ${volumeUnitLabel(units)}` : ''}
                      {log.cost != null ? ` · $${log.cost.toFixed(2)}` : ''}
                    </ThemedText>
                    {log.distance_since_last_full_km != null ? (
                      <ThemedText type="small" themeColor="accent">
                        {formatDistance(log.distance_since_last_full_km * 1000, units)} {distanceUnitLabel(units)} since your last full tank
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                  </Pressable>
                ))
              )}

              <View style={[styles.sectionHeader, styles.sectionSpacing]}>
                <ThemedText type="statLabel" themeColor="textSecondary">
                  Expenses
                </ThemedText>
                <AddButton
                  onPress={() =>
                    router.push({ pathname: '/(app)/maintenance/new-expense', params: { bikeId: selectedBike.id } })
                  }
                />
              </View>
              {expenses.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No expenses logged yet.
                </ThemedText>
              ) : (
                expenses.map((expense) => (
                  <Pressable
                    key={expense.id}
                    onPress={() =>
                      router.push({ pathname: '/(app)/maintenance/edit-expense', params: { id: expense.id } })
                    }>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <ThemedText type="smallBold">
                          {EXPENSE_CATEGORY_LABELS[expense.category]}
                          {expense.provider ? ` · ${expense.provider}` : ''}
                        </ThemedText>
                        <View style={styles.cardHeaderRight}>
                          {expense.attachments.length > 0 ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              📎 {expense.attachments.length}
                            </ThemedText>
                          ) : null}
                          <ThemedText type="default" themeColor="textSecondary">
                            ›
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {new Date(expense.incurred_at).toLocaleDateString()} · ${expense.amount.toFixed(2)}
                        {expense.description ? ` · ${expense.description}` : ''}
                      </ThemedText>
                      {expense.reference_number || expense.period_end ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {expense.reference_number ? `#${expense.reference_number}` : ''}
                          {expense.reference_number && expense.period_end ? ' · ' : ''}
                          {expense.period_end ? `Expires ${new Date(expense.period_end).toLocaleDateString()}` : ''}
                        </ThemedText>
                      ) : null}
                    </ThemedView>
                  </Pressable>
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
  // The lists span the full screen width (cancelling the screen's side
  // padding) and carry that padding inside instead, so card shadows aren't
  // sliced off at the edges. They also scroll under the tab bar, with iOS
  // adding exactly enough end padding (contentInsetAdjustmentBehavior) for
  // the last card to clear it.
  fullBleed: {
    marginHorizontal: -Spacing.four,
  },
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  suggestedCard: {
    opacity: 0.75,
  },
  suggestedHint: {
    marginTop: -Spacing.half,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dueSection: {
    gap: Spacing.one,
    marginBottom: Spacing.four,
  },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    width: ADD_BUTTON_SIZE,
    height: ADD_BUTTON_SIZE,
    borderRadius: ADD_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View, type AlertButton } from 'react-native';
import { Image } from 'expo-image';
import type { ImagePickerOptions } from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatCard } from '@/components/ui/StatCard';
import { Colors, Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import {
  computeMaintenanceStats,
  describeDue,
  DUE_STATUS_LABELS,
  getCurrentOdometerKm,
  getDueItems,
  MAINTENANCE_TYPE_LABELS,
} from '@/features/maintenance/maintenanceMath';
import {
  computeAggregateStats,
  distanceUnitLabel,
  formatDistance,
  formatLeanDeg,
  formatSpeed,
  formatTotalDuration,
  speedUnitLabel,
} from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { deleteBike, getBike, removeBikePhoto, setBikePhoto, type Bike } from '@/services/bikesService';
import { listExpenses, type Expense } from '@/services/expenseService';
import { listFuelLogs, type FuelLog } from '@/services/fuelService';
import { listMaintenanceRecords, type MaintenanceRecord } from '@/services/maintenanceService';
import { listRides, type RideSummary } from '@/services/ridesService';

// Loaded via require() inside try/catch, not a static import — see
// src/features/ride-tracking/useLeanAngleTracker.ts for why: native modules
// on this build have intermittently failed to register at launch.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[BikeDetailScreen] expo-image-picker native module unavailable', e);
}

// Apple's Liquid Glass material — iOS 26+ only, and the package's own docs
// warn some early iOS betas claim support but crash on it, so this is
// checked once via isGlassEffectAPIAvailable() rather than trusted blindly.
// Falls back to a plain frosted-looking View everywhere else (older iOS,
// Android, or if the native module itself fails to register).
let GlassEffect: typeof import('expo-glass-effect') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GlassEffect = require('expo-glass-effect');
} catch (e) {
  console.error('[BikeDetailScreen] expo-glass-effect native module unavailable', e);
}
const glassAvailable = !!GlassEffect?.isGlassEffectAPIAvailable();

// Photo height below the status bar. The photo runs edge to edge under the
// see-through header, so the real height adds the status bar on top of this.
const HERO_HEIGHT = 340;
const CARD_OVERLAP = 64;
// Standard iOS nav bar height — only used to decide when the name card has
// scrolled up under the header, so it doesn't need to be exact.
const NAV_BAR_HEIGHT = 44;

/** "today" / "yesterday" / "3 days ago" / "on Sep 12" — counted in calendar days, not 24h blocks. */
function formatLastRidden(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // round, not floor — a DST change makes one calendar day 23 or 25 hours.
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return `on ${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}`;
}

export default function BikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();
  const [bike, setBike] = useState<Bike | null>(null);
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Scroll-driven hero: pulling down past the top stretches the photo to fill
  // the gap (instead of showing empty background above it), and once the
  // name card scrolls up under the header, the header shows the bike's name.
  const insets = useSafeAreaInsets();
  const heroHeight = insets.top + HERO_HEIGHT;
  const titleThreshold = heroHeight - CARD_OVERLAP - (insets.top + NAV_BAR_HEIGHT);
  const scrollY = useSharedValue(0);
  const [pastHero, setPastHero] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  useAnimatedReaction(
    () => scrollY.value > titleThreshold,
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setPastHero, current);
    }
  );
  const heroStretchStyle = useAnimatedStyle(() => {
    const pull = Math.min(scrollY.value, 0);
    // Scale from the centre, then shift up by half the pull, so the bottom
    // edge stays put and the top edge follows the finger.
    return { transform: [{ translateY: pull / 2 }, { scale: (heroHeight - pull) / heroHeight }] };
  });

  // Re-read on every focus, not just on mount — coming back from Edit
  // (e.g. after setting the odometer) or from logging a service should show
  // the new values without leaving and re-entering the page.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      Promise.all([getBike(id), listRides(), listMaintenanceRecords(id), listFuelLogs(id), listExpenses(id)])
        .then(([bikeResult, allRides, recordsResult, fuelResult, expensesResult]) => {
          setBike(bikeResult);
          setRides(allRides.filter((r) => r.bike_id === id));
          setRecords(recordsResult);
          setFuelLogs(fuelResult);
          setExpenses(expensesResult);
        })
        .catch((e) => console.error('[BikeDetailScreen] failed to load', e))
        .finally(() => setLoading(false));
    }, [id])
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (!bike) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Bike not found.
        </ThemedText>
      </ThemedView>
    );
  }

  // `name` is either a real nickname or, when the user skipped one, an
  // auto-join of year/make/model computed once at creation time (see
  // bikes/new.tsx). The hero card leads with the nickname and, when there is
  // one, puts the full year/make/model under it — the nav bar already shows
  // the nickname alone, so the card shouldn't just repeat it.
  const derivedName = [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
  const hasNickname = bike.name.trim().length > 0 && bike.name.trim() !== derivedName.trim();
  const title = hasNickname ? bike.name : derivedName || bike.name;

  const onDelete = () => {
    Alert.alert(
      `Delete ${title}?`,
      'Its service records, expenses and fuel logs are deleted too, from this phone and your cloud backup. Your rides on it stay in your ride history. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteBike(bike.id);
              router.back();
            } catch (e) {
              console.error('[BikeDetailScreen] failed to delete', e);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const displayPhotoUri = removed ? null : (localPhotoUri ?? bike.photo_url);

  const pickFrom = async (source: 'camera' | 'library') => {
    setPhotoError(null);
    if (!ImagePicker) {
      setPhotoError('Photo picker is unavailable right now — try force-quitting and reopening the app.');
      return;
    }

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        source === 'camera'
          ? 'Camera access is required to take a bike photo.'
          : 'Photo library access is required to set a bike photo.'
      );
      return;
    }

    const options: ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;

    const pickedUri = result.assets[0].uri;
    setLocalPhotoUri(pickedUri);
    setRemoved(false);

    setPhotoBusy(true);
    try {
      await setBikePhoto(bike.id, pickedUri);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to save photo');
      setLocalPhotoUri(null);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    setPhotoError(null);
    setRemoved(true);
    setLocalPhotoUri(null);
    setPhotoBusy(true);
    try {
      await removeBikePhoto(bike.id);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to remove photo');
      setRemoved(false);
    } finally {
      setPhotoBusy(false);
    }
  };

  // Android only — on iOS the header camera button is a native menu instead
  // (see Stack.Toolbar below).
  const onEditPhoto = () => {
    const buttons: AlertButton[] = [
      { text: 'Take Photo', onPress: () => pickFrom('camera') },
      { text: 'Choose from Library', onPress: () => pickFrom('library') },
    ];
    if (displayPhotoUri) {
      buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: onRemovePhoto });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Bike Photo', undefined, buttons);
  };

  const cardContent = (
    <>
      <ThemedText
        type="subtitle"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={styles.nameCardTitle}>
        🏍️ {title}
      </ThemedText>
      {hasNickname && derivedName ? (
        <ThemedText type="default" numberOfLines={1} style={styles.nameCardSubtitle}>
          {derivedName}
        </ThemedText>
      ) : null}
    </>
  );

  const hasVin = !!bike.vin?.trim();
  const hasOdometer = bike.current_odometer_km != null;
  const odometerText = hasOdometer
    ? `${formatDistance((bike.current_odometer_km as number) * 1000, units)} ${distanceUnitLabel(units)}`
    : 'Set odometer';
  const onEditOdometer = () =>
    router.push({
      pathname: '/(app)/bikes/edit',
      params: { id: bike.id, focus: 'odometer' },
    });

  const stats = computeAggregateStats(rides);
  const topSpeedKmh = rides.reduce((max, r) => Math.max(max, r.max_speed_kmh ?? 0), 0);
  const maxLeanDeg = rides.reduce((max, r) => Math.max(max, Math.abs(r.lean_max_deg ?? 0)), 0);
  const lastRiddenAt = rides.length
    ? new Date(Math.max(...rides.map((r) => new Date(r.started_at).getTime()))).toISOString()
    : null;

  // Same "current odometer" and "next due" logic the Maintenance tab uses,
  // so the two never disagree about what's coming up.
  const currentOdometerKm = getCurrentOdometerKm(bike.current_odometer_km, records, fuelLogs);
  const nextDue = getDueItems(records, currentOdometerKm)[0] ?? null;
  const { totalSpent } = computeMaintenanceStats(records, fuelLogs, expenses);
  const nextDueColor = nextDue
    ? nextDue.status === 'overdue'
      ? theme.danger
      : nextDue.status === 'soon'
        ? theme.accent
        : theme.textSecondary
    : theme.textSecondary;
  const nextDueDetail = nextDue
    ? [DUE_STATUS_LABELS[nextDue.status], describeDue(nextDue, units)].filter(Boolean).join(' · ')
    : null;

  const onEdit = () => router.push({ pathname: '/(app)/bikes/edit', params: { id: bike.id } });
  const onOpenPhoto = (uri: string) => router.push({ pathname: '/(app)/bikes/photo', params: { uri } });

  // dismissTo, not push — this pops back to the tab bar and switches it to
  // Maintenance (with this bike already open), rather than stacking a second
  // copy of the tabs on top of this page.
  const onOpenMaintenance = () =>
    router.dismissTo({
      pathname: '/(app)/(tabs)/maintenance',
      params: { bikeId: bike.id },
    });

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          // Hidden while the name card is on screen — it already shows it.
          title: pastHero ? title : '',
          // iOS 26+ fades content under the header by itself; older iOS needs
          // a blur once the page scrolls under the see-through header.
          headerBlurEffect: pastHero && !glassAvailable ? 'systemChromeMaterial' : 'none',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable
                onPress={onEditPhoto}
                disabled={photoBusy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Bike photo">
                <ThemedText type="default">📷</ThemedText>
              </Pressable>
              <Pressable onPress={onEdit} hitSlop={8}>
                <ThemedText type="default" style={{ color: theme.accent }}>
                  Edit
                </ThemedText>
              </Pressable>
            </View>
          ),
        }}
      />
      {/* Overrides headerRight on iOS. Rendered on iOS only: Android's version
          of the toolbar drops SF Symbol icons. */}
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="camera" title="Bike Photo" accessibilityLabel="Bike photo" disabled={photoBusy}>
            <Stack.Toolbar.MenuAction icon="camera" onPress={() => pickFrom('camera')}>
              Take Photo
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="photo.on.rectangle" onPress={() => pickFrom('library')}>
              Choose from Library
            </Stack.Toolbar.MenuAction>
            {displayPhotoUri ? (
              <Stack.Toolbar.MenuAction icon="trash" destructive onPress={onRemovePhoto}>
                Remove Photo
              </Stack.Toolbar.MenuAction>
            ) : null}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Button onPress={onEdit} tintColor={theme.accent}>
            Edit
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      {/* Light status bar text over the photo's dark top fade; back to the
          theme's own once the page scrolls under the header. */}
      <StatusBar style={displayPhotoUri && !pastHero ? 'light' : 'auto'} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Tapping the photo opens it full screen. Changing it is only done
            from the header camera button. */}
        <Animated.View style={[{ height: heroHeight }, heroStretchStyle]}>
          {displayPhotoUri ? (
            <Pressable
              onPress={() => onOpenPhoto(displayPhotoUri)}
              disabled={photoBusy}
              accessibilityRole="imagebutton"
              accessibilityLabel="View photo full screen"
              style={StyleSheet.absoluteFill}>
              <Image source={{ uri: displayPhotoUri }} contentFit="cover" transition={200} style={StyleSheet.absoluteFill} />
            </Pressable>
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.heroPlaceholder,
                { backgroundColor: theme.backgroundElement, paddingTop: insets.top },
              ]}>
              <ThemedText style={styles.heroPlaceholderEmoji}>🏍️</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Tap the camera button to add a photo
              </ThemedText>
            </View>
          )}
          {displayPhotoUri ? (
            <View pointerEvents="none" style={[styles.heroTopFade, { height: insets.top + 96 }]} />
          ) : null}
          {/* Fades the bottom of the photo into the page background. */}
          <View
            pointerEvents="none"
            style={[
              styles.heroBottomFade,
              { experimental_backgroundImage: `linear-gradient(to bottom, ${theme.background}00, ${theme.background})` },
            ]}
          />
          {photoBusy ? (
            <View style={[StyleSheet.absoluteFill, styles.heroOverlay]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Animated.View>

        {glassAvailable && GlassEffect ? (
          <GlassEffect.GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.nameCard}>
            {cardContent}
          </GlassEffect.GlassView>
        ) : (
          <View style={[styles.nameCard, styles.nameCardFallback]}>{cardContent}</View>
        )}

        <View style={styles.body}>
          {photoError ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {photoError}
            </ThemedText>
          ) : null}

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Details
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.detailsCard}>
            <DetailRow label="Make" value={bike.make ?? '—'} />
            <DetailRow label="Model" value={bike.model ?? '—'} />
            <DetailRow label="Year" value={bike.year ? String(bike.year) : '—'} />
            <DetailRow
              label="Odometer"
              value={odometerText}
              accent={!hasOdometer}
              onPress={onEditOdometer}
              isLast={!hasVin}
            />
            {hasVin ? <DetailRow label="VIN" value={bike.vin as string} mono isLast /> : null}
          </ThemedView>

          <View style={[styles.sectionHeader, styles.sectionLabel]}>
            <ThemedText type="statLabel" themeColor="textSecondary">
              Activity
            </ThemedText>
            {lastRiddenAt ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                Last ride {formatLastRidden(lastRiddenAt)}
              </ThemedText>
            ) : null}
          </View>
          {stats.rideCount > 0 ? (
            <>
              <View style={styles.statsRow}>
                <StatCard label="Rides" value={String(stats.rideCount)} />
                <StatCard
                  label="Total Distance"
                  value={formatDistance(stats.totalDistanceMeters, units)}
                  unit={distanceUnitLabel(units)}
                />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Total Time" value={formatTotalDuration(stats.totalDurationSeconds)} />
                <StatCard
                  label="Longest Ride"
                  value={formatDistance(stats.longestRideMeters, units)}
                  unit={distanceUnitLabel(units)}
                />
              </View>
              <View style={styles.statsRow}>
                <StatCard
                  label="Top Speed"
                  value={topSpeedKmh > 0 ? formatSpeed(topSpeedKmh, units) : '—'}
                  unit={topSpeedKmh > 0 ? speedUnitLabel(units) : undefined}
                />
                <StatCard label="Max Lean" value={maxLeanDeg > 0 ? `${formatLeanDeg(maxLeanDeg)}°` : '—'} />
              </View>
            </>
          ) : (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="default" themeColor="textSecondary">
                No rides on this bike yet.
              </ThemedText>
            </ThemedView>
          )}

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Maintenance
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.detailsCard}>
            <View
              style={[
                styles.detailRow,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}>
              <ThemedText type="default" themeColor="textSecondary">
                Next Service
              </ThemedText>
              {nextDue ? (
                <View style={styles.nextDueValue}>
                  <ThemedText type="default" numberOfLines={1}>
                    {MAINTENANCE_TYPE_LABELS[nextDue.record.type]}
                  </ThemedText>
                  <ThemedText type="small" numberOfLines={1} style={{ color: nextDueColor }}>
                    {nextDueDetail}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText type="default" themeColor="textSecondary" style={styles.detailValue}>
                  Nothing scheduled
                </ThemedText>
              )}
            </View>
            <DetailRow label="Total Spent" value={`$${totalSpent.toFixed(2)}`} />
            <Pressable
              onPress={onOpenMaintenance}
              accessibilityRole="button"
              style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}>
              <ThemedText type="default" themeColor="accent">
                Open Maintenance
              </ThemedText>
              <ThemedText type="default" themeColor="accent">
                ›
              </ThemedText>
            </Pressable>
          </ThemedView>

          <Pressable
            onPress={onDelete}
            disabled={deleting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.deleteRow,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            {deleting ? (
              <ActivityIndicator color={theme.danger} />
            ) : (
              <ThemedText type="default" themeColor="danger">
                Delete Bike
              </ThemedText>
            )}
          </Pressable>
        </View>
      </Animated.ScrollView>
    </ThemedView>
  );
}

function DetailRow({
  label,
  value,
  mono,
  accent,
  onPress,
  isLast,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** Value in the accent color — for a "Set …" call to action in place of a missing value. */
  accent?: boolean;
  /** Makes the whole row tappable and adds a chevron. */
  onPress?: () => void;
  isLast?: boolean;
}) {
  const theme = useTheme();
  const rowStyle = [
    styles.detailRow,
    !isLast && {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
  ];
  const content = (
    <>
      <ThemedText type="default" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.detailValueRow}>
        <ThemedText
          type={mono ? 'code' : 'default'}
          themeColor={accent ? 'accent' : 'text'}
          numberOfLines={1}
          style={styles.detailValue}>
          {value}
        </ThemedText>
        {onPress ? (
          <ThemedText type="default" themeColor="textSecondary">
            ›
          </ThemedText>
        ) : null}
      </View>
    </>
  );

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}>
      {content}
    </Pressable>
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
    paddingBottom: Spacing.six,
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  heroPlaceholderEmoji: {
    fontSize: 64,
    lineHeight: 76,
  },
  heroTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0))',
  },
  heroBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  nameCard: {
    marginTop: -CARD_OVERLAP,
    marginHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.half,
    overflow: 'hidden',
  },
  nameCardFallback: {
    backgroundColor: 'rgba(12,12,14,0.82)',
  },
  // The card is always dark (dark glass, or the dark fallback fill) whatever
  // the app theme is, so its text is pinned to the dark palette — the themed
  // light-mode text color would be near-black on a near-black card.
  nameCardTitle: {
    color: Colors.dark.text,
  },
  nameCardSubtitle: {
    color: Colors.dark.textSecondary,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  detailsCard: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  nextDueValue: {
    flexShrink: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  emptyCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  deleteRow: {
    marginTop: Spacing.four,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});

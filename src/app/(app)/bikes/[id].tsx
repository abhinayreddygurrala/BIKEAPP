import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View, type AlertButton } from 'react-native';
import { Image } from 'expo-image';
import type { ImagePickerOptions } from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { computeAggregateStats, distanceUnitLabel, formatDistance, formatDuration } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { deleteBike, getBike, removeBikePhoto, setBikePhoto, type Bike } from '@/services/bikesService';
import { listRides } from '@/services/ridesService';

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

const HERO_HEIGHT = 320;
const CARD_OVERLAP = 64;

export default function BikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();
  const [bike, setBike] = useState<Bike | null>(null);
  const [stats, setStats] = useState(computeAggregateStats([]));
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getBike(id), listRides()])
      .then(([bikeResult, rides]) => {
        setBike(bikeResult);
        setStats(computeAggregateStats(rides.filter((r) => r.bike_id === id)));
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#fff" />
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

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteBike(bike.id);
      router.back();
    } finally {
      setDeleting(false);
    }
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

  // `name` is either a real nickname or, when the user skipped one, an
  // auto-join of year/make/model computed once at creation time (see
  // bikes/new.tsx). Either way the hero card's only job is identity — the
  // Details section below is the single source of truth for the facts, so
  // there's nothing else to repeat here.
  const derivedName = [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
  const hasNickname = bike.name.trim().length > 0 && bike.name.trim() !== derivedName.trim();
  const title = hasNickname ? bike.name : derivedName || bike.name;

  const cardContent = (
    <ThemedText type="subtitle" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
      🏍️ {title}
    </ThemedText>
  );

  const hasVin = !!bike.vin?.trim();
  const odometerText =
    bike.current_odometer_km != null
      ? `${formatDistance(bike.current_odometer_km * 1000, units)} ${distanceUnitLabel(units)}`
      : '—';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/(app)/bikes/edit', params: { id } })} hitSlop={8}>
              <ThemedText type="default" style={{ color: theme.accent }}>
                Edit
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onEditPhoto} disabled={photoBusy} style={styles.heroWrap}>
          {displayPhotoUri ? (
            <Image source={{ uri: displayPhotoUri }} contentFit="cover" transition={200} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.heroPlaceholderEmoji}>🏍️</ThemedText>
            </View>
          )}
          {photoBusy ? (
            <View style={[styles.hero, styles.heroOverlay]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Pressable>

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
            <DetailRow label="Odometer" value={odometerText} isLast={!hasVin} />
            {hasVin ? <DetailRow label="VIN" value={bike.vin as string} mono isLast /> : null}
          </ThemedView>

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Activity
          </ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Rides" value={String(stats.rideCount)} />
            <StatCard
              label="Total Distance"
              value={formatDistance(stats.totalDistanceMeters, units)}
              unit={distanceUnitLabel(units)}
            />
          </View>
          <StatCard label="Total Time" value={formatDuration(stats.totalDurationSeconds)} />

          <PrimaryButton label="Delete Bike" variant="danger" onPress={onDelete} loading={deleting} style={styles.deleteButton} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function DetailRow({
  label,
  value,
  mono,
  isLast,
}: {
  label: string;
  value: string;
  mono?: boolean;
  isLast?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.detailRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <ThemedText type="default" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type={mono ? 'code' : 'default'} numberOfLines={1} style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
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
  heroWrap: {
    width: '100%',
  },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderEmoji: {
    fontSize: 64,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
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
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.two,
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
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  deleteButton: {
    marginTop: Spacing.three,
  },
});

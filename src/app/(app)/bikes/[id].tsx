import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { computeAggregateStats, distanceUnitLabel, formatDistance, formatDuration } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { deleteBike, getBike, setBikePhoto, type Bike } from '@/services/bikesService';
import { listRides } from '@/services/ridesService';

// Loaded via require() inside try/catch, not a static import: expo-router
// evaluates every screen's module while building the route tree at startup,
// even ones the user hasn't opened yet, so a throw here (native modules on
// this build have intermittently failed to register at launch) would crash
// navigation app-wide. A dynamic require lets it fail closed: picking a
// photo just shows an error instead.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[BikeDetailScreen] expo-image-picker native module unavailable', e);
}

const PHOTO_SIZE = 120;

export default function BikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();
  const [bike, setBike] = useState<Bike | null>(null);
  const [stats, setStats] = useState(computeAggregateStats([]));
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
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

  const displayPhotoUri = localPhotoUri ?? bike.photo_url;

  const onChoosePhoto = async () => {
    setPhotoError(null);
    if (!ImagePicker) {
      setPhotoError('Photo picker is unavailable right now — try force-quitting and reopening the app.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo library access is required to set a bike photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const pickedUri = result.assets[0].uri;
    setLocalPhotoUri(pickedUri);
    setPhotoUploading(true);
    try {
      await setBikePhoto(bike.id, pickedUri);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to save photo');
      setLocalPhotoUri(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <Pressable onPress={onChoosePhoto} disabled={photoUploading} style={styles.photoWrap}>
          {displayPhotoUri ? (
            <Image source={{ uri: displayPhotoUri }} resizeMode="cover" style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="title">🏍️</ThemedText>
            </View>
          )}
          {photoUploading ? (
            <View style={[styles.photo, styles.photoOverlay]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </Pressable>
        {photoError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {photoError}
          </ThemedText>
        ) : null}

        <ThemedText type="title">🏍️ {bike.name}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {[bike.make, bike.model, bike.year].filter(Boolean).join(' · ') || 'No details yet'}
        </ThemedText>
        {bike.current_odometer_km != null ? (
          <ThemedText type="default" themeColor="textSecondary">
            {bike.current_odometer_km} km on the odometer
          </ThemedText>
        ) : null}

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
      </SafeAreaView>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  deleteButton: {
    marginTop: Spacing.three,
  },
  photoWrap: {
    marginBottom: Spacing.two,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: Spacing.three,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});

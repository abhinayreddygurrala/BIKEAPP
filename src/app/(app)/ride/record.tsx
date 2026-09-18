import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BikePickerSheet } from '@/components/ride/BikePickerSheet';
import { RouteMap, type RouteMapHandle } from '@/components/map/RouteMap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { requestRideTrackingPermissions, useRideRecorder } from '@/features/ride-tracking/useRideRecorder';
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatLeanDeg,
  formatSpeed,
  speedUnitLabel,
} from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { getBike } from '@/services/bikesService';

type PermissionStep = 'checking' | 'need-foreground' | 'need-background' | 'foreground-only' | 'ready';

export default function RecordRideScreen() {
  const [permissionStep, setPermissionStep] = useState<PermissionStep>('checking');
  const recorder = useRideRecorder();
  const { units } = useAuth();
  const theme = useTheme();
  const mapRef = useRef<RouteMapHandle>(null);
  const [bikeId, setBikeId] = useState<string | null>(null);
  const [bikeName, setBikeName] = useState<string | null>(null);
  const [bikePickerVisible, setBikePickerVisible] = useState(false);

  const onSelectBike = (nextBikeId: string | null) => {
    setBikeId(nextBikeId);
    if (!nextBikeId) {
      setBikeName(null);
      return;
    }
    getBike(nextBikeId)
      .then((bike) => setBikeName(bike?.name ?? null))
      .catch(() => {});
  };

  useKeepAwake(undefined, { suppressDeactivateWarnings: true });

  useEffect(() => {
    (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setPermissionStep('need-foreground');
        return;
      }
      const bg = await Location.getBackgroundPermissionsAsync();
      setPermissionStep(bg.status === 'granted' ? 'ready' : 'need-background');
    })();
  }, []);

  const handleRequestForeground = async () => {
    const { foreground, background } = await requestRideTrackingPermissions();
    if (!foreground) {
      setPermissionStep('need-foreground');
      return;
    }
    setPermissionStep(background ? 'ready' : 'need-background');
  };

  const handleRequestBackground = async () => {
    const result = await Location.requestBackgroundPermissionsAsync();
    setPermissionStep(result.status === 'granted' ? 'ready' : 'foreground-only');
  };

  const handleStop = async () => {
    const finishedRideId = await recorder.stop();
    if (finishedRideId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/(app)/ride/[id]', params: { id: finishedRideId } });
    } else {
      router.back();
    }
  };

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recorder.start(bikeId);
  };

  if (permissionStep === 'checking') {
    return <ThemedView style={styles.flex} />;
  }

  if (permissionStep === 'need-foreground') {
    return (
      <PermissionPrompt
        title="Location Access"
        description="BikeApp uses your location to record your ride's route, distance, and speed while the app is open."
        actionLabel="Enable Location"
        onAction={handleRequestForeground}
      />
    );
  }

  if (permissionStep === 'need-background') {
    return (
      <PermissionPrompt
        title="Background Location"
        description="Allow Always access so BikeApp keeps recording your route, distance, and speed even when your phone is locked or the app is in the background. Without it, tracking pauses when you leave the app."
        actionLabel="Allow Background Access"
        onAction={handleRequestBackground}
        secondaryLabel="Continue without it"
        onSecondary={() => setPermissionStep('foreground-only')}
      />
    );
  }

  const isIdle = recorder.status === 'idle';
  const isRecording = recorder.status === 'recording';
  const isPaused = recorder.status === 'paused';

  return (
    <ThemedView style={styles.flex}>
      <RouteMap
        ref={mapRef}
        coordinates={recorder.coordinates}
        showsUserLocation
        followsUserLocation={isRecording}
        fitOnChange={isIdle}
        style={styles.map}>
        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          {permissionStep === 'foreground-only' ? (
            <ThemedView type="backgroundElement" style={styles.warningBanner}>
              <ThemedText type="small" style={{ color: '#FFB020' }}>
                Background access isn&apos;t enabled — recording will pause if you leave the app.
              </ThemedText>
            </ThemedView>
          ) : null}

          <Pressable
            onPress={() => mapRef.current?.recenterOnUser()}
            hitSlop={8}
            style={[styles.recenterButton, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="default" style={{ color: theme.accent }}>
              ◎
            </ThemedText>
          </Pressable>

          <View style={styles.spacer} />

          <View style={styles.statsRow}>
            <StatCard
              label="Distance"
              value={formatDistance(recorder.stats.distanceMeters, units)}
              unit={distanceUnitLabel(units)}
            />
            <StatCard label="Duration" value={formatDuration(recorder.stats.durationSeconds)} />
            <StatCard
              label="Speed"
              value={formatSpeed(recorder.stats.avgSpeedKmh, units)}
              unit={`${speedUnitLabel(units)} avg`}
            />
          </View>
          {isRecording || isPaused ? (
            <View style={styles.statsRow}>
              <StatCard label="Lean" value={formatLeanDeg(recorder.lean.currentDeg)} unit="deg" />
              <StatCard label="Max Lean" value={formatLeanDeg(recorder.lean.maxDeg)} unit="deg" />
            </View>
          ) : null}

          {isIdle ? (
            <Pressable
              onPress={() => setBikePickerVisible(true)}
              style={[styles.bikeRow, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Bike
              </ThemedText>
              <ThemedText type="default">{bikeName ?? 'No bike'}</ThemedText>
            </Pressable>
          ) : null}

          <View style={styles.controlsRow}>
            {isIdle ? (
              <PrimaryButton label="Start Ride" style={styles.flexButton} onPress={handleStart} />
            ) : null}
            {isRecording ? (
              <>
                <PrimaryButton
                  label="Pause"
                  variant="muted"
                  style={styles.flexButton}
                  onPress={recorder.pause}
                />
                <PrimaryButton label="Stop" variant="danger" style={styles.flexButton} onPress={handleStop} />
              </>
            ) : null}
            {isPaused ? (
              <>
                <PrimaryButton label="Resume" style={styles.flexButton} onPress={recorder.resume} />
                <PrimaryButton label="Stop" variant="danger" style={styles.flexButton} onPress={handleStop} />
              </>
            ) : null}
          </View>

          {isIdle ? (
            <PrimaryButton label="Cancel" variant="muted" onPress={() => router.back()} />
          ) : null}
        </SafeAreaView>
      </RouteMap>

      <BikePickerSheet
        visible={bikePickerVisible}
        selectedBikeId={bikeId}
        onSelect={onSelectBike}
        onClose={() => setBikePickerVisible(false)}
      />
    </ThemedView>
  );
}

function PermissionPrompt({
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.permissionContent}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.permissionDescription}>
          {description}
        </ThemedText>
        <PrimaryButton label={actionLabel} onPress={onAction} />
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} variant="muted" onPress={onSecondary} />
        ) : null}
        <PrimaryButton label="Cancel" variant="muted" onPress={() => router.back()} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  map: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  spacer: { flex: 1 },
  warningBanner: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  recenterButton: {
    position: 'absolute',
    right: Spacing.three,
    top: '38%',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  permissionDescription: {
    marginBottom: Spacing.three,
  },
});

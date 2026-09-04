import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/RouteMap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { StatCard } from '@/components/ui/StatCard';
import { Spacing } from '@/constants/theme';
import { requestRideTrackingPermissions, useRideRecorder } from '@/features/ride-tracking/useRideRecorder';
import { formatDistanceKm, formatDuration, formatSpeedKmh } from '@/features/ride-tracking/rideMath';

type PermissionStep = 'checking' | 'need-foreground' | 'need-background' | 'foreground-only' | 'ready';

export default function RecordRideScreen() {
  const [permissionStep, setPermissionStep] = useState<PermissionStep>('checking');
  const recorder = useRideRecorder();

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
      router.replace({ pathname: '/(app)/ride/[id]', params: { id: finishedRideId } });
    } else {
      router.back();
    }
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

          <View style={styles.spacer} />

          <View style={styles.statsRow}>
            <StatCard label="Distance" value={formatDistanceKm(recorder.stats.distanceMeters)} unit="km" />
            <StatCard label="Duration" value={formatDuration(recorder.stats.durationSeconds)} />
            <StatCard label="Speed" value={formatSpeedKmh(recorder.stats.avgSpeedKmh)} unit="km/h avg" />
          </View>

          <View style={styles.controlsRow}>
            {isIdle ? (
              <PrimaryButton
                label="Start Ride"
                style={styles.flexButton}
                onPress={() => recorder.start(null)}
              />
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
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
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

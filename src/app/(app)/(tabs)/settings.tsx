import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { useTheme } from '@/hooks/use-theme';
import { exportAllData } from '@/services/exportService';

const AVATAR_SIZE = 44;

export default function SettingsScreen() {
  const { profile, units, setUnits } = useSettings();
  const theme = useTheme();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      await exportAllData();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Settings</ThemedText>
          <Pressable onPress={() => router.push('/(app)/settings/profile-picture')}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} resizeMode="cover" style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">🏍️</ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        <Link href="/(app)/settings/account" asChild>
          <PrimaryButton label="Account" variant="muted" style={styles.leftAlignedButton} />
        </Link>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="statLabel" themeColor="textSecondary">
            Units
          </ThemedText>
          <View style={styles.unitsRow}>
            <Pressable
              onPress={() => setUnits('metric')}
              style={[
                styles.unitOption,
                { backgroundColor: units === 'metric' ? theme.backgroundSelected : 'transparent' },
              ]}>
              <ThemedText type="default">Kilometers</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setUnits('imperial')}
              style={[
                styles.unitOption,
                { backgroundColor: units === 'imperial' ? theme.backgroundSelected : 'transparent' },
              ]}>
              <ThemedText type="default">Miles</ThemedText>
            </Pressable>
          </View>
        </ThemedView>

        <Link href="/(app)/bikes" asChild>
          <PrimaryButton label="🏍️ My Bikes" variant="muted" />
        </Link>

        {exportError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {exportError}
          </ThemedText>
        ) : null}
        <PrimaryButton label="Export My Data" variant="muted" onPress={onExport} loading={exporting} />
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftAlignedButton: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  unitsRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  unitOption: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});

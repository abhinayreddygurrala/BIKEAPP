import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SettingsHero } from '@/components/settings/SettingsHero';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { UnitsSegmentedControl } from '@/components/settings/UnitsSegmentedControl';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useSettings } from '@/features/settings/SettingsContext';
import { useSync, type SyncState } from '@/features/sync/SyncContext';
import { TEXT_SCALE_LABELS, type ThemeMode } from '@/features/settings/settingsLocalDb';
import { useTheme } from '@/hooks/use-theme';
import { listBikes } from '@/services/bikesService';
import { exportAllData } from '@/services/exportService';
import { importBackup, pickBackupFile } from '@/services/importService';
import { listRides } from '@/services/ridesService';

const appVersion = Constants.expoConfig?.version;

function describeSaveStatus(state: SyncState, iso: string | null, photosFull: boolean): string {
  if (state === 'saving') return 'Saving to your account…';
  if (state === 'offline') return 'Offline — changes will save when you’re connected';
  if (photosFull) return 'All changes saved · photo space full';
  if (!iso) return 'Saving to your account…';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'All changes saved · just now';
  if (minutes < 60) return `All changes saved · ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `All changes saved · ${hours} hr ago`;
  return `All changes saved · ${new Date(iso).toLocaleDateString()}`;
}

const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System appearance',
  light: 'Light mode',
  dark: 'Dark mode',
};

export default function SettingsScreen() {
  const { profile, units, setUnits, textScale, themeMode } = useSettings();
  const { status: authStatus, user: authUser, signOut } = useAuth();
  const { syncState, lastSyncedAt, photoBackup, restore } = useSync();
  const theme = useTheme();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [bikeCount, setBikeCount] = useState(0);
  const [rideCount, setRideCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listBikes(), listRides()])
        .then(([bikes, rides]) => {
          setBikeCount(bikes.length);
          setRideCount(rides.length);
        })
        .catch((e) => console.error('[SettingsScreen] failed to load counts', e));
    }, [])
  );

  const onSignOut = () => {
    Alert.alert('Sign out?', 'Your rides, bikes, and records stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const onRestore = () => {
    Alert.alert(
      'Restore from Account?',
      'Brings everything saved in your account onto this phone, including photos and receipts. Entries already on this phone are replaced by the backed-up copy; nothing else is deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setSyncError(null);
            try {
              const count = await restore();
              const [bikes, rides] = await Promise.all([listBikes(), listRides()]);
              setBikeCount(bikes.length);
              setRideCount(rides.length);
              Alert.alert('Restore Complete', `${count} item${count === 1 ? '' : 's'} restored from your account.`);
            } catch {
              setSyncError('Couldn’t restore right now. Check your connection and try again.');
            }
          },
        },
      ]
    );
  };

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

  const onImport = async () => {
    setImportError(null);
    try {
      const picked = await pickBackupFile();
      if (!picked) return; // user canceled the file picker

      const { bundle, preview } = picked;
      Alert.alert(
        'Replace All Data?',
        `This backup has ${preview.bikes} bike${preview.bikes === 1 ? '' : 's'}, ${preview.rides} ride${
          preview.rides === 1 ? '' : 's'
        }, ${preview.maintenanceRecords} service record${preview.maintenanceRecords === 1 ? '' : 's'}, ${
          preview.fuelLogs
        } fuel log${preview.fuelLogs === 1 ? '' : 's'}, and ${preview.expenses} expense${
          preview.expenses === 1 ? '' : 's'
        }.\n\nImporting will permanently replace everything currently on this phone with this backup. Photos aren’t included in backups and won’t be restored.\n\nThis can’t be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace Everything',
            style: 'destructive',
            onPress: async () => {
              setImporting(true);
              try {
                await importBackup(bundle);
                setBikeCount(preview.bikes);
                setRideCount(preview.rides);
                Alert.alert('Import Complete', 'Force-quit and reopen Odomap to see your restored data.');
              } catch (e) {
                setImportError(e instanceof Error ? e.message : 'Failed to import backup');
              } finally {
                setImporting(false);
              }
            },
          },
        ]
      );
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to read that file');
    }
  };

  return (
    <ThemedView style={styles.flex}>
      {/* Top inset only: the list scrolls under the tab bar, and iOS adds
          just enough end padding for the last row to clear it. */}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(450)}>
            <SettingsHero
              avatarUri={profile?.avatar_url ?? null}
              displayName={profile?.display_name ?? null}
              bio={profile?.bio ?? null}
              bikeCount={bikeCount}
              rideCount={rideCount}
              onPressAvatar={() => router.push('/(app)/settings/profile-picture')}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(50).duration(450)} style={styles.section}>
            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
              Account
            </ThemedText>
            {authStatus === 'signedIn' ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.controlCaption}>
                {authUser ? `Signed in as @${authUser.username}` : 'Signed in'}
                {`\n${describeSaveStatus(syncState, lastSyncedAt, photoBackup === 'full')}`}
              </ThemedText>
            ) : null}
            <ThemedView type="backgroundElement" style={styles.card}>
              {authStatus === 'signedOut' ? (
                <SettingsRow
                  title="Sign In or Create Account"
                  subtitle="Save your rides, bikes & records to the cloud"
                  onPress={() => router.push('/(app)/auth/sign-in')}
                  showDivider
                />
              ) : null}
              <SettingsRow
                title="Profile"
                subtitle="Name & bio"
                onPress={() => router.push('/(app)/settings/account')}
                showDivider={authStatus === 'signedIn'}
              />
              {authStatus === 'signedIn' ? (
                <SettingsRow
                  title="Change Password"
                  onPress={() => router.push('/(app)/settings/change-password')}
                />
              ) : null}
            </ThemedView>
            {authStatus === 'signedIn' ? (
              <ThemedView type="backgroundElement" style={[styles.card, styles.controlGap]}>
                <SettingsRow
                  title="Restore from Account"
                  subtitle="Bring your saved data onto this phone"
                  onPress={onRestore}
                />
              </ThemedView>
            ) : null}
            {syncError ? (
              <ThemedText type="small" style={[styles.exportError, { color: theme.danger }]}>
                {syncError}
              </ThemedText>
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.section}>
            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
              Preferences
            </ThemedText>
            <UnitsSegmentedControl value={units} onChange={setUnits} />
            <ThemedView type="backgroundElement" style={[styles.card, styles.controlGap]}>
              <SettingsRow
                title="Accessibility"
                subtitle={`${THEME_MODE_LABELS[themeMode]} · ${TEXT_SCALE_LABELS[textScale]} text`}
                onPress={() => router.push('/(app)/settings/accessibility')}
              />
            </ThemedView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(450)} style={styles.section}>
            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
              Garage
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              <SettingsRow
                title="My Bikes"
                subtitle="Manage your garage"
                onPress={() => router.push('/(app)/bikes')}
              />
            </ThemedView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(450)} style={styles.section}>
            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
              Data
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              <SettingsRow
                title="Export My Data"
                subtitle="Save a backup to Drive, Files, or Gmail"
                onPress={onExport}
                loading={exporting}
                showDivider
              />
              <SettingsRow
                title="Import My Data"
                subtitle="Restore from a backup file"
                onPress={onImport}
                loading={importing}
              />
            </ThemedView>
            {exportError ? (
              <ThemedText type="small" style={[styles.exportError, { color: theme.danger }]}>
                {exportError}
              </ThemedText>
            ) : null}
            {importError ? (
              <ThemedText type="small" style={[styles.exportError, { color: theme.danger }]}>
                {importError}
              </ThemedText>
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(290).duration(450)} style={styles.section}>
            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
              About
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              <SettingsRow
                title="Privacy Policy"
                onPress={() => Linking.openURL('https://abhinayreddygurrala.github.io/BIKEAPP/privacy.html')}
                showDivider
              />
              <SettingsRow
                title="Support"
                onPress={() => Linking.openURL('https://abhinayreddygurrala.github.io/BIKEAPP/support.html')}
              />
            </ThemedView>
          </Animated.View>

          {/* Last on the page, the usual iOS spot, so the destructive actions
              are out of the way of everyday settings. */}
          {authStatus === 'signedIn' ? (
            <Animated.View entering={FadeInDown.delay(330).duration(450)} style={styles.section}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <SettingsRow title="Sign Out" onPress={onSignOut} showChevron={false} showDivider />
                <SettingsRow
                  title="Delete Account"
                  destructive
                  onPress={() => router.push('/(app)/settings/delete-account')}
                />
              </ThemedView>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(360).duration(450)} style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              {appVersion ? `Odomap v${appVersion}` : 'Odomap'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Made for the ride.
            </ThemedText>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  section: {
    marginTop: Spacing.four,
  },
  sectionLabel: {
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  controlCaption: {
    marginBottom: Spacing.one,
    marginLeft: Spacing.one,
  },
  controlGap: {
    marginTop: Spacing.three,
  },
  exportError: {
    marginTop: Spacing.two,
    marginLeft: Spacing.one,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.five,
    gap: Spacing.half,
  },
});

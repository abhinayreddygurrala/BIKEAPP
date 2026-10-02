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
import { getActiveRideId } from '@/features/ride-tracking/activeRideStore';
import { UnsavedChangesError, useSync, type SyncState } from '@/features/sync/SyncContext';
import { TEXT_SCALE_LABELS, type ThemeMode } from '@/features/settings/settingsLocalDb';
import { useTheme } from '@/hooks/use-theme';
import { listBikes } from '@/services/bikesService';
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
  const { user: authUser } = useAuth();
  const { syncState, lastSyncedAt, photoBackup, restore, signOutAndClear } = useSync();
  const [signingOut, setSigningOut] = useState(false);
  const theme = useTheme();
  const [syncError, setSyncError] = useState<string | null>(null);
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

  const runSignOut = async (force: boolean) => {
    setSigningOut(true);
    try {
      await signOutAndClear({ force });
    } catch (e) {
      setSigningOut(false);
      if (!(e instanceof UnsavedChangesError)) {
        Alert.alert('Couldn’t sign out', 'Try again in a moment.');
        return;
      }
      Alert.alert(
        'Not everything is saved yet',
        e.reason === 'photos'
          ? 'Some photos or receipts aren’t saved to your account. If you sign out now, they’ll be removed from this phone and lost.'
          : 'Odomap can’t reach your account right now, so your latest changes aren’t saved. If you sign out now, they’ll be lost.',
        [
          { text: 'Stay Signed In', style: 'cancel' },
          { text: 'Sign Out Anyway', style: 'destructive', onPress: () => void runSignOut(true) },
        ]
      );
    }
  };

  const onSignOut = async () => {
    if (await getActiveRideId()) {
      Alert.alert('Finish your ride first', 'A ride is being recorded. Stop it before signing out so it’s saved to your account.');
      return;
    }
    Alert.alert(
      'Sign out?',
      'Everything is saved to your account, then removed from this phone. Sign in again to bring it all back.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => void runSignOut(false) },
      ]
    );
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
            <ThemedText type="small" themeColor="textSecondary" style={styles.controlCaption}>
              {authUser ? `Signed in as @${authUser.username}` : 'Signed in'}
              {`\n${describeSaveStatus(syncState, lastSyncedAt, photoBackup === 'full')}`}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              <SettingsRow
                title="Profile"
                subtitle="Name & bio"
                onPress={() => router.push('/(app)/settings/account')}
                showDivider
              />
              <SettingsRow title="Change Password" onPress={() => router.push('/(app)/settings/change-password')} />
            </ThemedView>
            <ThemedView type="backgroundElement" style={[styles.card, styles.controlGap]}>
              <SettingsRow
                title="Restore from Account"
                subtitle="Bring your saved data onto this phone"
                onPress={onRestore}
              />
            </ThemedView>
            {syncError ? (
              <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>
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
          <Animated.View entering={FadeInDown.delay(330).duration(450)} style={styles.section}>
            <ThemedView type="backgroundElement" style={styles.card}>
              <SettingsRow
                title="Sign Out"
                onPress={() => void onSignOut()}
                loading={signingOut}
                showChevron={false}
                showDivider
              />
              <SettingsRow
                title="Delete Account"
                destructive
                onPress={() => router.push('/(app)/settings/delete-account')}
              />
            </ThemedView>
          </Animated.View>

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
  errorText: {
    marginTop: Spacing.two,
    marginLeft: Spacing.one,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.five,
    gap: Spacing.half,
  },
});

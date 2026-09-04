import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Settings</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="statLabel" themeColor="textSecondary">
            Signed in as
          </ThemedText>
          <ThemedText type="default">{session?.user.email}</ThemedText>
        </ThemedView>

        <Link href="/(app)/bikes" asChild>
          <PrimaryButton label="My Bikes" variant="muted" />
        </Link>

        <PrimaryButton label="Sign Out" variant="danger" onPress={signOut} />
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
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});

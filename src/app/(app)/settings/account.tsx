import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function AccountScreen() {
  const theme = useTheme();
  const { profile, updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && !seeded) {
      // One-time seed from the profile once it loads — after this, typing
      // shouldn't get clobbered by our own optimistic update on save.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setSeeded(true);
    }
  }, [profile, seeded]);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ display_name: displayName.trim() || null, bio: bio.trim() || null });
    } catch (e) {
      console.error('[AccountScreen] failed to save', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="statLabel" themeColor="textSecondary">
          Display Name
        </ThemedText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Bio
        </ThemedText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Say as much as you want"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[inputStyle, styles.bioInput]}
        />

        <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />

        <Link href="/(app)/settings/change-password" asChild>
          <PrimaryButton label="Change Password" variant="muted" />
        </Link>
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
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  label: {
    marginTop: Spacing.three,
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

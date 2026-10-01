import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { useTheme } from '@/hooks/use-theme';

export default function AccountScreen() {
  const theme = useTheme();
  const { profile, updateProfile } = useSettings();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ display_name: displayName.trim() || null, bio: bio.trim() || null });
      router.back();
    } catch (e) {
      console.error('[AccountScreen] failed to save', e);
      setError(e instanceof Error ? e.message : 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        {/* Same keyboard handling as the app's other forms: without it, the
            keyboard covers the Save button while you're typing a bio. */}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
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

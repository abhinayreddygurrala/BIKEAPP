import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/apiClient';

export default function ChangePasswordScreen() {
  const { changePassword } = useAuth();
  const theme = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = currentPassword.length > 0 && newPassword.length > 0;

  const onSave = async () => {
    setCurrentError(null);
    setNewError(null);
    setError(null);
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert('Password changed', 'You’ve been signed out of any other devices.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.field === 'currentPassword') setCurrentError(e.message);
      else if (e instanceof ApiError && e.field === 'newPassword') setNewError(e.message);
      else setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <FormField
              label="Current password"
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                setCurrentError(null);
              }}
              password
              textContentType="password"
              autoComplete="current-password"
              error={currentError}
            />
            <FormField
              label="New password"
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setNewError(null);
              }}
              password
              textContentType="newPassword"
              autoComplete="new-password"
              hint="At least 8 characters."
              error={newError}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Change Password" onPress={onSave} loading={saving} disabled={!canSubmit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});

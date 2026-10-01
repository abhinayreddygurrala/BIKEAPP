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

export default function DeleteAccountScreen() {
  const { user, deleteAccount } = useAuth();
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const performDelete = async () => {
    setPasswordError(null);
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(password);
      Alert.alert('Account deleted', 'Your Odomap account has been permanently deleted.');
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.field === 'password') setPasswordError(e.message);
      else setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete your account?',
      `${user ? `@${user.username} will be` : 'Your account will be'} permanently deleted. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: performDelete },
      ]
    );
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="default">
              This permanently deletes your Odomap account — your username, email, and phone number — and signs you
              out.
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              Your rides, bikes, and maintenance records live on this phone, not in your account, so they are not
              affected.
            </ThemedText>

            <FormField
              label="Confirm with your password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(null);
              }}
              password
              textContentType="password"
              autoComplete="current-password"
              error={passwordError}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton
              label="Delete My Account"
              variant="danger"
              onPress={onDelete}
              loading={deleting}
              disabled={password.length === 0}
            />
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

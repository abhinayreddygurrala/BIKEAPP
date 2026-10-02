import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormField } from '@/components/ui/FormField';
import { MovingLetters } from '@/components/ui/MovingLetters';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, isApiConfigured } from '@/lib/apiClient';

export type SignInFormProps = {
  /** Called after a successful sign-in. */
  onDone: () => void;
  /** Switches to the create-account form. */
  onSwitch: () => void;
  /** Extra content under the form (the opening screen's "Skip for now"). */
  footer?: ReactNode;
};

export function SignInForm({ onDone, onSwitch, footer }: SignInFormProps) {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && isApiConfigured();

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(identifier.trim(), password);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <MovingLetters text="Odomap" style={[styles.title, { color: theme.text }]} />
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              Sign in to join group chat.
            </ThemedText>

            {!isApiConfigured() ? (
              <ThemedView type="backgroundElement" style={styles.notice}>
                <ThemedText type="small" style={{ color: theme.warning }}>
                  Accounts aren’t connected to a server yet, so sign-in isn’t available.
                </ThemedText>
              </ThemedView>
            ) : null}

            <FormField
              label="Username, email, or phone"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="rider_one"
              textContentType="username"
              autoComplete="username"
              returnKeyType="next"
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              password
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={canSubmit ? onSubmit : undefined}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Sign In" onPress={onSubmit} loading={loading} disabled={!canSubmit} />

            <View style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary">
                New to Odomap?
              </ThemedText>
              <Pressable onPress={onSwitch} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  Create an account
                </ThemedText>
              </Pressable>
            </View>
            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  notice: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});

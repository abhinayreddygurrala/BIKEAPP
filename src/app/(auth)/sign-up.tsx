import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function SignUpScreen() {
  const { signUp, signInWithGoogle } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setLoading(false);
    if (signUpError) {
      setError(signUpError);
    } else {
      setConfirmation(true);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error: googleError } = await signInWithGoogle();
    setGoogleLoading(false);
    if (googleError) setError(googleError);
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ThemedView style={styles.content}>
            <ThemedText type="title">BikeApp</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              Create an account to start recording rides.
            </ThemedText>

            {confirmation ? (
              <ThemedText type="default">
                Check your email to confirm your account, then sign in.
              </ThemedText>
            ) : (
              <>
                <PrimaryButton
                  label="Continue with Google"
                  variant="muted"
                  onPress={onGoogle}
                  loading={googleLoading}
                />

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <ThemedText type="small" themeColor="textSecondary">
                    or
                  </ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  secureTextEntry
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />

                {error ? (
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {error}
                  </ThemedText>
                ) : null}

                <PrimaryButton label="Sign Up" onPress={onSubmit} loading={loading} />
              </>
            )}

            <Link href="/(auth)/sign-in" style={styles.link}>
              <ThemedText type="link" themeColor="textSecondary">
                Already have an account? <ThemedText type="linkPrimary">Sign in</ThemedText>
              </ThemedText>
            </Link>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  subtitle: {
    marginBottom: Spacing.three,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  link: {
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
});

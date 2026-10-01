import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FormField } from '@/components/ui/FormField';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { MovingLetters } from '@/components/ui/MovingLetters';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth, type UsernameCheck } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, isApiConfigured } from '@/lib/apiClient';

// Mirrors the server's rule so the format is checked instantly while typing;
// the server remains the authority.
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const PRIVACY_URL = 'https://abhinayreddygurrala.github.io/BIKEAPP/privacy.html';

type FieldName = 'username' | 'email' | 'phone' | 'password';

export default function SignUpScreen() {
  const { signUp, checkUsername } = useAuth();
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<{ name: string; result: UsernameCheck | 'error' } | null>(null);

  const trimmedUsername = username.trim();
  const usernameFormatOk = USERNAME_RE.test(trimmedUsername);

  // Asks the server whether the name is free ~half a second after typing stops.
  useEffect(() => {
    if (!usernameFormatOk || !isApiConfigured()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsername(trimmedUsername);
        if (!cancelled) setRemote({ name: trimmedUsername, result });
      } catch {
        if (!cancelled) setRemote({ name: trimmedUsername, result: 'error' });
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedUsername, usernameFormatOk, checkUsername]);

  const remoteForCurrent = remote?.name === trimmedUsername ? remote.result : null;
  const usernameTaken = typeof remoteForCurrent === 'object' && remoteForCurrent !== null && !remoteForCurrent.available;

  let usernameHint = '3–20 characters: letters, numbers, and underscores. Must start with a letter.';
  let usernameTone: 'neutral' | 'good' | 'bad' = 'neutral';
  if (trimmedUsername && usernameFormatOk && isApiConfigured()) {
    if (remoteForCurrent === null) {
      usernameHint = 'Checking…';
    } else if (remoteForCurrent === 'error') {
      usernameHint = 'Couldn’t check right now — we’ll check again when you submit.';
    } else if (remoteForCurrent.available) {
      usernameHint = 'Available';
      usernameTone = 'good';
    } else {
      usernameHint = remoteForCurrent.message ?? 'That username is taken.';
      usernameTone = 'bad';
    }
  }

  const clearFieldError = (field: FieldName) => setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

  const canSubmit =
    isApiConfigured() &&
    usernameFormatOk &&
    !usernameTaken &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    password.length > 0;

  const onSubmit = async () => {
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await signUp({ username: trimmedUsername, email: email.trim(), phone: phone.trim(), password });
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.field && ['username', 'email', 'phone', 'password'].includes(e.field)) {
        setFieldErrors({ [e.field as FieldName]: e.message });
      } else {
        setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      }
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
              Create an account to join group chat. Your rides stay on your phone either way.
            </ThemedText>

            {!isApiConfigured() ? (
              <ThemedView type="backgroundElement" style={styles.notice}>
                <ThemedText type="small" style={{ color: theme.warning }}>
                  Accounts aren’t connected to a server yet, so sign-up isn’t available.
                </ThemedText>
              </ThemedView>
            ) : null}

            <FormField
              label="Username"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                clearFieldError('username');
              }}
              placeholder="rider_one"
              maxLength={20}
              textContentType="username"
              autoComplete="username-new"
              error={fieldErrors.username}
              hint={usernameHint}
              hintTone={usernameTone}
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                clearFieldError('email');
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              error={fieldErrors.email}
            />
            <FormField
              label="Phone number"
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                clearFieldError('phone');
              }}
              placeholder="(501) 555-0123"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              error={fieldErrors.phone}
              hint="US numbers work without +1."
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearFieldError('password');
              }}
              placeholder="At least 8 characters"
              password
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={canSubmit ? onSubmit : undefined}
              error={fieldErrors.password}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Create Account" onPress={onSubmit} loading={loading} disabled={!canSubmit} />

            <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
              By creating an account you agree to our{' '}
              <ThemedText type="small" themeColor="accent" onPress={() => Linking.openURL(PRIVACY_URL)}>
                Privacy Policy
              </ThemedText>
              .
            </ThemedText>

            <View style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Already have an account?
              </ThemedText>
              <Pressable onPress={() => router.replace('/(app)/auth/sign-in')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  Sign in
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <KeyboardDoneAccessory />
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
  legal: {
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});

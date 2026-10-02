import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { SignInForm } from '@/features/auth/SignInForm';
import { SignUpForm } from '@/features/auth/SignUpForm';

/**
 * The first screen when the app opens and nobody is signed in. Signing in,
 * creating an account, or tapping "Skip for now" all lead into the app — the
 * root layout swaps screens as soon as the account state changes, so nothing
 * here navigates by itself. Skipping keeps the app usable without an account
 * (and with no signal), which the App Store requires for apps whose main
 * feature doesn't need one.
 */
export default function WelcomeScreen() {
  const { skipSignIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');

  const skip = (
    <View style={styles.skipArea}>
      <Pressable onPress={() => void skipSignIn()} hitSlop={12} style={styles.skip} accessibilityRole="button">
        <ThemedText type="small" themeColor="textSecondary">
          Skip for now
        </ThemedText>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary" style={styles.skipNote}>
        If you skip, your data is saved only on this phone. You can create an account later in Settings.
      </ThemedText>
    </View>
  );

  return mode === 'signIn' ? (
    <SignInForm onDone={() => {}} onSwitch={() => setMode('signUp')} footer={skip} />
  ) : (
    <SignUpForm onDone={() => {}} onSwitch={() => setMode('signIn')} footer={skip} />
  );
}

const styles = StyleSheet.create({
  skipArea: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  skip: {
    paddingVertical: Spacing.two,
  },
  skipNote: {
    textAlign: 'center',
  },
});

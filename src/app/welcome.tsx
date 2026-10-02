import { useState } from 'react';

import { SignInForm } from '@/features/auth/SignInForm';
import { SignUpForm } from '@/features/auth/SignUpForm';

/**
 * The first screen whenever nobody is signed in: Odomap needs an account,
 * so signing in or creating one is the only way into the app. The root
 * layout swaps screens as soon as the account state changes, so nothing
 * here navigates by itself.
 */
export default function WelcomeScreen() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');

  return mode === 'signIn' ? (
    <SignInForm onDone={() => {}} onSwitch={() => setMode('signUp')} />
  ) : (
    <SignUpForm onDone={() => {}} onSwitch={() => setMode('signIn')} />
  );
}

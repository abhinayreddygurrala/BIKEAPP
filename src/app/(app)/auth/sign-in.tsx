import { router } from 'expo-router';

import { SignInForm } from '@/features/auth/SignInForm';

// Opened from Settings (the opening screen at app launch is /welcome).
export default function SignInScreen() {
  return <SignInForm onDone={() => router.back()} onSwitch={() => router.replace('/(app)/auth/sign-up')} />;
}

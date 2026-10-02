import { router } from 'expo-router';

import { SignUpForm } from '@/features/auth/SignUpForm';

// Opened from Settings (the opening screen at app launch is /welcome).
export default function SignUpScreen() {
  return <SignUpForm onDone={() => router.back()} onSwitch={() => router.replace('/(app)/auth/sign-in')} />;
}

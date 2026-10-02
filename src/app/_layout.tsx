import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LaunchIntro } from '@/components/ui/LaunchIntro';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { SettingsProvider, useSettings } from '@/features/settings/SettingsContext';
import { SyncProvider } from '@/features/sync/SyncContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
// Side-effect import: registers the background location task at app
// startup, before any screen can call startLocationUpdatesAsync.
import '@/features/ride-tracking/rideTrackingTask';

SplashScreen.preventAutoHideAsync();

// Loaded via require() in try/catch rather than a static import, per this
// project's convention for native modules (see useLeanAngleTracker.ts): a
// registration failure at startup should degrade to "root background doesn't
// follow the theme", not crash navigation app-wide.
let SystemUI: typeof import('expo-system-ui') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SystemUI = require('expo-system-ui');
} catch (e) {
  console.error('[RootLayout] expo-system-ui native module unavailable', e);
}

function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useTheme();

  // The native root view's own background — what shows through during
  // transitions and overscroll — has to follow the theme too.
  useEffect(() => {
    SystemUI?.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}

function RootNavigator() {
  const { isLoading } = useSettings();
  const { status, hasSkippedSignIn } = useAuth();
  const ready = !isLoading && status !== 'loading';

  // Opening sign-in screen until someone signs in or taps "Skip for now";
  // the switch happens automatically when either changes.
  const showWelcome = status === 'signedOut' && !hasSkippedSignIn;

  return (
    <>
      {ready ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={showWelcome}>
            <Stack.Screen name="welcome" />
          </Stack.Protected>
          <Stack.Protected guard={!showWelcome}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      ) : null}
      {/* Takes over from the native splash screen (and hides it), then
          reveals the first screen once it's ready. */}
      <LaunchIntro ready={ready} />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Portrait everywhere by default — the ride recording screen is the one
    // place that opts back into landscape (for a horizontal handlebar
    // mount) and restores this on its own way out.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <AuthProvider>
          <SyncProvider>
            <AppThemeProvider>
              <RootNavigator />
            </AppThemeProvider>
          </SyncProvider>
        </AuthProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}

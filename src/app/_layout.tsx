import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsProvider, useSettings } from '@/features/settings/SettingsContext';
// Side-effect import: registers the background location task at app
// startup, before any screen can call startLocationUpdatesAsync.
import '@/features/ride-tracking/rideTrackingTask';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isLoading } = useSettings();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
    </Stack>
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
      <ThemeProvider value={DarkTheme}>
        <SettingsProvider>
          <RootNavigator />
        </SettingsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

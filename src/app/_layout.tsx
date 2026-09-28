import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
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

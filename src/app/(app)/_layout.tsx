import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="ride/record" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="ride/[id]" options={{ headerShown: true, title: 'Ride' }} />
      <Stack.Screen name="bikes/new" options={{ presentation: 'modal', headerShown: true, title: 'New Bike' }} />
      <Stack.Screen name="bikes/[id]" options={{ headerShown: true, title: 'Bike' }} />
    </Stack>
  );
}

import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

// Modal presentations don't get an automatic back button on iOS — without
// this a sheet has no way to dismiss but a swipe.
function CancelHeaderButton() {
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <ThemedText type="default" themeColor="accent">
        Cancel
      </ThemedText>
    </Pressable>
  );
}

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="ride/record" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen
        name="ride/[id]"
        options={{ headerShown: true, title: 'Ride', headerBackTitle: 'Rides' }}
      />
      <Stack.Screen
        name="ride/new"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Log Past Ride',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="ride/edit"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Edit Ride',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="bikes/index"
        options={{ headerShown: true, title: '🏍️ My Bikes', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="bikes/new"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: '🏍️ New Bike',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="bikes/[id]"
        options={{ headerShown: true, title: 'Bike', headerBackTitle: 'My Bikes' }}
      />
      <Stack.Screen
        name="settings/account"
        options={{ headerShown: true, title: 'Account', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/profile-picture"
        options={{ headerShown: true, title: 'Profile Picture', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/change-password"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Change Password',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="groups/new"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'New Group',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="groups/[id]/index"
        options={{ headerShown: true, title: 'Group', headerBackTitle: 'Groups' }}
      />
      <Stack.Screen
        name="groups/[id]/settings"
        options={{ headerShown: true, title: 'Group Settings' }}
      />
    </Stack>
  );
}

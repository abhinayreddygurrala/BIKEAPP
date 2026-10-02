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
      <Stack.Screen
        name="records"
        options={{ headerShown: true, title: '🏆 Records', headerBackTitle: 'Rides' }}
      />
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
      {/* See-through header so the bike photo runs up behind it to the top of
          the screen. Set here rather than in the page so the push transition
          starts transparent instead of flashing a solid bar first. The page
          fills in the title once the photo scrolls away. */}
      <Stack.Screen
        name="bikes/[id]"
        options={{
          headerShown: true,
          headerTransparent: true,
          headerBackButtonDisplayMode: 'minimal',
          title: '',
        }}
      />
      {/* Full-screen photo viewer. A transparent modal, so the bike page stays
          visible behind it while the photo is dragged down to close. */}
      <Stack.Screen name="bikes/photo" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen
        name="bikes/edit"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Edit Bike',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/new-service"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Log Service',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/new-fuel"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Log Fuel-Up',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/edit-service"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Edit Service',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/edit-fuel"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Edit Fuel-Up',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/new-expense"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Log Expense',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="maintenance/edit-expense"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Edit Expense',
          headerLeft: CancelHeaderButton,
        }}
      />
      <Stack.Screen
        name="settings/account"
        options={{ headerShown: true, title: 'Profile', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/accessibility"
        options={{ headerShown: true, title: 'Accessibility', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/change-password"
        options={{ headerShown: true, title: 'Change Password', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/delete-account"
        options={{ headerShown: true, title: 'Delete Account', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="settings/profile-picture"
        options={{ headerShown: true, title: 'Profile Picture', headerBackTitle: 'Settings' }}
      />
    </Stack>
  );
}

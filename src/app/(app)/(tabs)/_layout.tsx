import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      // Real native iOS blur material instead of a flat fill — Android has
      // no blurEffect, so it keeps an opaque background there.
      blurEffect="systemChromeMaterialDark"
      backgroundColor={Platform.OS === 'android' ? colors.background : undefined}
      shadowColor={colors.border}
      indicatorColor={colors.backgroundElement}
      tintColor={colors.accent}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Rides</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="speedometer" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="maintenance">
        <NativeTabs.Trigger.Label>Maintenance</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wrench.and.screwdriver" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="navigation">
        <NativeTabs.Trigger.Label>Navigate</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="location.north.line" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Label>Group</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.3" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

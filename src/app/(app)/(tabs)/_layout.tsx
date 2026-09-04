import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
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

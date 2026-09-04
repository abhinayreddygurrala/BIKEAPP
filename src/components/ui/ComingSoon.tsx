import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.description}>
          {description}
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.badge}>
          <ThemedText type="statLabel" themeColor="textSecondary">
            Coming soon
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  description: {
    textAlign: 'center',
  },
  badge: {
    marginTop: Spacing.three,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});

import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { listBikes, type Bike } from '@/services/bikesService';

export default function BikesScreen() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    listBikes()
      .then(setBikes)
      .catch((e) => console.error('[BikesScreen] failed to load bikes', e))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <FlatList
          data={bikes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={bikes.length === 0 ? styles.emptyList : styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/bikes/[id]', params: { id: item.id } })}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[item.make, item.model, item.year].filter(Boolean).join(' · ') || 'No details yet'}
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
          ListEmptyComponent={
            loaded ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                No bikes yet.
              </ThemedText>
            ) : null
          }
        />
        <Link href="/(app)/bikes/new" asChild>
          <PrimaryButton label="Add Bike" />
        </Link>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});

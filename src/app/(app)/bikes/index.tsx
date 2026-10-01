import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingActions } from '@/components/ui/FloatingActions';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';

export default function BikesScreen() {
  const theme = useTheme();
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [actionsHeight, setActionsHeight] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    listBikes()
      .then(setBikes)
      .catch((e) => console.error('[BikesScreen] failed to load bikes', e))
      .finally(() => setLoaded(true));
  }, []);

  // Refocus (not just first mount) — this screen stays mounted underneath
  // when you push into a bike's detail page, so a delete there wouldn't
  // otherwise be reflected here on the way back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {!loaded ? (
          <ActivityIndicator color={theme.text} style={styles.loading} />
        ) : (
          // Runs to the bottom of the screen under the floating Add Bike
          // button; the padding lets the last bike scroll fully clear of it.
          <FlatList
            data={bikes}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={[
              bikes.length === 0 ? styles.emptyList : styles.list,
              { paddingBottom: actionsHeight + Spacing.two },
            ]}
            scrollIndicatorInsets={{ bottom: actionsHeight }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/bikes/[id]', params: { id: item.id } })}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">🏍️ {item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[item.make, item.model, item.year].filter(Boolean).join(' · ') || 'No details yet'}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                No bikes yet.
              </ThemedText>
            }
          />
        )}
        <FloatingActions onHeightChange={setActionsHeight}>
          <Link href="/(app)/bikes/new" asChild>
            <PrimaryButton label="🏍️ Add Bike" />
          </Link>
        </FloatingActions>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Side padding inside the list (not around it) so card shadows have room
  // and aren't sliced off at the list's edges.
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});

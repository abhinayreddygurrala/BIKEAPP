import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { deleteBike, getBike, type Bike } from '@/services/bikesService';

export default function BikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bike, setBike] = useState<Bike | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getBike(id)
      .then(setBike)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </ThemedView>
    );
  }

  if (!bike) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Bike not found.
        </ThemedText>
      </ThemedView>
    );
  }

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteBike(bike.id);
      router.back();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">{bike.name}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {[bike.make, bike.model, bike.year].filter(Boolean).join(' · ') || 'No details yet'}
        </ThemedText>
        {bike.current_odometer_km != null ? (
          <ThemedText type="default" themeColor="textSecondary">
            {bike.current_odometer_km} km on the odometer
          </ThemedText>
        ) : null}
        <PrimaryButton label="Delete Bike" variant="danger" onPress={onDelete} loading={deleting} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
});

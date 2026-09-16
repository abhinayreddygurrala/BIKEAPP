import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BikePickerSheet } from '@/components/ride/BikePickerSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBike, type Bike } from '@/services/bikesService';
import { deleteRide, getRideDetail, updateRide, type RideSummary } from '@/services/ridesService';

export default function EditRideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [ride, setRide] = useState<RideSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState('');
  const [bikeId, setBikeId] = useState<string | null>(null);
  const [bikeName, setBikeName] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    getRideDetail(id)
      .then((r) => {
        setRide(r);
        setTitle(r?.title ?? '');
        setBikeId(r?.bike_id ?? null);
        if (r?.bike_id) {
          getBike(r.bike_id)
            .then((bike: Bike | null) => setBikeName(bike?.name ?? null))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const onSelectBike = (nextBikeId: string | null) => {
    setBikeId(nextBikeId);
    if (!nextBikeId) {
      setBikeName(null);
      return;
    }
    getBike(nextBikeId)
      .then((bike) => setBikeName(bike?.name ?? null))
      .catch(() => {});
  };

  const onSave = async () => {
    if (!ride) return;
    setSaving(true);
    try {
      await updateRide(ride, { title: title.trim() || null, bike_id: bikeId });
      router.back();
    } catch (e) {
      console.error('[EditRideScreen] failed to save', e);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!ride) return;
    Alert.alert('Delete Ride', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteRide(ride);
            router.dismissTo('/(app)/(tabs)');
          } catch (e) {
            console.error('[EditRideScreen] failed to delete', e);
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </ThemedView>
    );
  }

  if (!ride) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Ride not found.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="statLabel" themeColor="textSecondary">
          Title
        </ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={new Date(ride.started_at).toLocaleDateString(undefined, { weekday: 'long' }) + ' Ride'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Bike
        </ThemedText>
        <Pressable
          onPress={() => setPickerVisible(true)}
          style={[styles.input, styles.bikeRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="default">{bikeName ?? 'No bike'}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            Change
          </ThemedText>
        </Pressable>

        <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
        <PrimaryButton label="Delete Ride" variant="danger" onPress={onDelete} loading={deleting} />
      </SafeAreaView>

      <BikePickerSheet
        visible={pickerVisible}
        selectedBikeId={bikeId}
        onSelect={onSelectBike}
        onClose={() => setPickerVisible(false)}
      />
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
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  label: {
    marginTop: Spacing.three,
  },
  bikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

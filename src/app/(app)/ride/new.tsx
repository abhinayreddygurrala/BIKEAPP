import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BikePickerSheet } from '@/components/ride/BikePickerSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { distanceToMeters, distanceUnitLabel } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { getBike } from '@/services/bikesService';
import { createManualRide } from '@/services/ridesService';

const now = new Date();

export default function NewManualRideScreen() {
  const theme = useTheme();
  const { units } = useAuth();

  const [title, setTitle] = useState('');
  const [bikeId, setBikeId] = useState<string | null>(null);
  const [bikeName, setBikeName] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [day, setDay] = useState(String(now.getDate()));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [distance, setDistance] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    const distanceValue = parseFloat(distance);
    const durationSeconds = (parseInt(hours, 10) || 0) * 3600 + (parseInt(minutes, 10) || 0) * 60;
    const startedAt = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);

    if (!distanceValue || distanceValue <= 0) {
      setError('Enter a distance greater than 0');
      return;
    }
    if (durationSeconds <= 0) {
      setError('Enter a duration greater than 0');
      return;
    }
    if (Number.isNaN(startedAt.getTime())) {
      setError('Enter a valid date');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
      const id = await createManualRide({
        bikeId,
        title: title.trim() || null,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        distanceMeters: distanceToMeters(distanceValue, units),
        durationSeconds,
      });
      router.replace({ pathname: '/(app)/ride/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save ride');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional)"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        <Pressable
          onPress={() => setPickerVisible(true)}
          style={[styles.input, styles.bikeRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="default">{bikeName ?? 'No bike'}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            Change
          </ThemedText>
        </Pressable>

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Date
        </ThemedText>
        <View style={styles.row}>
          <TextInput
            value={month}
            onChangeText={setMonth}
            placeholder="MM"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={2}
            style={[inputStyle, styles.flexInput]}
          />
          <TextInput
            value={day}
            onChangeText={setDay}
            placeholder="DD"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={2}
            style={[inputStyle, styles.flexInput]}
          />
          <TextInput
            value={year}
            onChangeText={setYear}
            placeholder="YYYY"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
            style={[inputStyle, styles.flexInput]}
          />
        </View>

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Distance ({distanceUnitLabel(units)})
        </ThemedText>
        <TextInput
          value={distance}
          onChangeText={setDistance}
          placeholder="0.0"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Duration
        </ThemedText>
        <View style={styles.row}>
          <TextInput
            value={hours}
            onChangeText={setHours}
            placeholder="Hours"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[inputStyle, styles.flexInput]}
          />
          <TextInput
            value={minutes}
            onChangeText={setMinutes}
            placeholder="Minutes"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[inputStyle, styles.flexInput]}
          />
        </View>

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Save Ride" onPress={onSave} loading={saving} style={styles.saveButton} />
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  label: {
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexInput: {
    flex: 1,
  },
  bikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveButton: {
    marginTop: Spacing.three,
  },
});

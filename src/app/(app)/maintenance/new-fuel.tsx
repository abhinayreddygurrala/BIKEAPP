import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createFuelLog } from '@/services/fuelService';

export default function NewFuelScreen() {
  const { bikeId } = useLocalSearchParams<{ bikeId: string }>();
  const theme = useTheme();

  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await createFuelLog({
        bike_id: bikeId,
        filled_at: new Date().toISOString(),
        odometer_km: odometer.trim() ? Number(odometer) : null,
        liters: liters.trim() ? Number(liters) : null,
        cost: cost.trim() ? Number(cost) : null,
        full_tank: fullTank,
        notes: null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="statLabel" themeColor="textSecondary">
          Odometer (km)
        </ThemedText>
        <TextInput
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 12680"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numeric"
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Liters
        </ThemedText>
        <TextInput
          value={liters}
          onChangeText={setLiters}
          placeholder="e.g. 12.5"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Cost
        </ThemedText>
        <TextInput
          value={cost}
          onChangeText={setCost}
          placeholder="e.g. 18.00"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={inputStyle}
        />

        <Pressable style={[styles.toggleRow, styles.label]} onPress={() => setFullTank((v) => !v)}>
          <View
            style={[
              styles.checkbox,
              { borderColor: theme.accent },
              fullTank && { backgroundColor: theme.accent },
            ]}
          />
          <ThemedText type="default">Filled to a full tank</ThemedText>
        </Pressable>

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
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
    gap: Spacing.one,
  },
  label: {
    marginTop: Spacing.three,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Spacing.one,
    borderWidth: 2,
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

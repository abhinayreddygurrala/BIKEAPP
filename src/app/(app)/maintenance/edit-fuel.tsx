import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { displayValueToLiters, formatVolume, volumeUnitLabel } from '@/features/maintenance/maintenanceMath';
import { distanceToMeters, distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { deleteFuelLog, getFuelLog, updateFuelLog, type FuelLog } from '@/services/fuelService';

export default function EditFuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();

  const [fuelLog, setFuelLog] = useState<FuelLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getFuelLog(id)
      .then((log) => {
        setFuelLog(log);
        setOdometer(log?.odometer_km != null ? formatDistance(log.odometer_km * 1000, units) : '');
        setLiters(log?.liters != null ? formatVolume(log.liters, units) : '');
        setCost(log?.cost != null ? String(log.cost) : '');
        setFullTank(log ? log.full_tank === 1 : true);
      })
      .finally(() => setLoading(false));
    // units is read once here to pre-fill the field in whatever unit is
    // active right now — it isn't meant to re-convert an already-edited
    // field if the user flips units mid-edit elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateFuelLog(id, {
        odometer_km: odometer.trim() ? distanceToMeters(Number(odometer), units) / 1000 : null,
        liters: liters.trim() ? displayValueToLiters(Number(liters), units) : null,
        cost: cost.trim() ? Number(cost) : null,
        full_tank: fullTank ? 1 : 0,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete Fuel Log', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteFuelLog(id);
            router.back();
          } catch (e) {
            console.error('[EditFuelScreen] failed to delete', e);
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (!fuelLog) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Fuel log not found.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>
            <ThemedText type="statLabel" themeColor="textSecondary">
              Odometer ({distanceUnitLabel(units)})
            </ThemedText>
            <TextInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder={units === 'imperial' ? 'e.g. 7900' : 'e.g. 12680'}
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              style={inputStyle}
            />

            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
              Fuel ({volumeUnitLabel(units)})
            </ThemedText>
            <TextInput
              value={liters}
              onChangeText={setLiters}
              placeholder={units === 'imperial' ? 'e.g. 3.3' : 'e.g. 12.5'}
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
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
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              style={inputStyle}
            />

            <Pressable style={[styles.toggleRow, styles.label]} onPress={() => setFullTank((v) => !v)}>
              <View style={[styles.checkbox, { borderColor: theme.accent }]}>
                {fullTank ? (
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    ✓
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="default">Filled to a full tank</ThemedText>
            </Pressable>

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
            <PrimaryButton label="Delete Fuel Log" variant="danger" onPress={onDelete} loading={deleting} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <KeyboardDoneAccessory />
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

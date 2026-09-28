import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createMaintenanceRecord, type MaintenanceType } from '@/services/maintenanceService';

// Loaded via require() inside try/catch, not a static import — see
// src/features/ride-tracking/useLeanAngleTracker.ts for why: native modules
// on this build have intermittently failed to register at launch.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[NewServiceScreen] expo-image-picker native module unavailable', e);
}

const TYPE_LABELS: Record<MaintenanceType, string> = {
  oil_change: 'Oil Change',
  chain: 'Chain',
  tires: 'Tires',
  brake_pads: 'Brake Pads',
  service: 'Service',
  other: 'Other',
};
const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [MaintenanceType, string][];

export default function NewServiceScreen() {
  const { bikeId } = useLocalSearchParams<{ bikeId: string }>();
  const theme = useTheme();

  const [type, setType] = useState<MaintenanceType>('oil_change');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onAttachReceipt = async () => {
    if (!ImagePicker) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setReceiptUri(result.assets[0].uri);
  };

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await createMaintenanceRecord({
        bike_id: bikeId,
        type,
        performed_at: new Date().toISOString(),
        odometer_km: odometer.trim() ? Number(odometer) : null,
        cost: cost.trim() ? Number(cost) : null,
        notes: notes.trim() || null,
        next_due_odometer_km: null,
        next_due_date: null,
        receiptUri,
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
          Type
        </ThemedText>
        <PrimaryButton
          label={TYPE_LABELS[type]}
          variant="muted"
          style={styles.leftAligned}
          onPress={() => setTypePickerVisible(true)}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Odometer (km)
        </ThemedText>
        <TextInput
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 12500"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numeric"
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Cost
        </ThemedText>
        <TextInput
          value={cost}
          onChangeText={setCost}
          placeholder="e.g. 45.00"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={inputStyle}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Notes
        </ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[inputStyle, styles.notesInput]}
        />

        <View style={styles.label}>
          <PrimaryButton
            label={receiptUri ? '📎 Receipt attached' : '📎 Attach Receipt/Bill'}
            variant="muted"
            onPress={onAttachReceipt}
            disabled={!ImagePicker}
          />
        </View>

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
      </SafeAreaView>

      <SelectSheet
        visible={typePickerVisible}
        title="Service Type"
        selected={TYPE_LABELS[type]}
        options={TYPE_OPTIONS.map(([, label]) => label)}
        onSelect={(label) => {
          const match = TYPE_OPTIONS.find(([, l]) => l === label);
          if (match) setType(match[0]);
        }}
        onClose={() => setTypePickerVisible(false)}
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
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  leftAligned: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

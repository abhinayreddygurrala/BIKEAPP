import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AttachmentPicker, type AttachmentItem } from '@/components/maintenance/AttachmentPicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { buildMaintenanceScanSchema, MAINTENANCE_TYPE_LABELS, type MaintenanceScanResult } from '@/features/maintenance/maintenanceMath';
import { distanceToMeters, distanceUnitLabel } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { uuidv4 } from '@/lib/uuid';
import { createMaintenanceRecord, type MaintenanceType } from '@/services/maintenanceService';
import { scanDocument } from '@/services/receiptScanService';

const TYPE_LABELS = MAINTENANCE_TYPE_LABELS;
const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [MaintenanceType, string][];

export default function NewServiceScreen() {
  const { bikeId, type: initialType } = useLocalSearchParams<{ bikeId: string; type?: MaintenanceType }>();
  const { units } = useSettings();
  const theme = useTheme();

  const [type, setType] = useState<MaintenanceType>(initialType ?? 'oil_change');
  const [typeTouched, setTypeTouched] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDueOdometer, setNextDueOdometer] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  // Held locally and only copied into permanent storage at Save time — the
  // record these would attach to doesn't exist yet.
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  // Only fills a field that's still empty (or, for Type, only if the picker
  // hasn't been touched yet) — the model augments what you haven't entered,
  // it never overwrites a choice you already made.
  const autoFillFromPhoto = async (uri: string) => {
    setScanning(true);
    try {
      const result = await scanDocument<MaintenanceScanResult>(
        uri,
        'Extract the fields from this photo of a motorcycle service receipt or invoice.',
        buildMaintenanceScanSchema()
      );
      if (!result) return;
      if (!typeTouched && result.type && result.type in MAINTENANCE_TYPE_LABELS) {
        setType(result.type as MaintenanceType);
      }
      if (result.odometer != null && !odometer.trim()) setOdometer(String(result.odometer));
      if (result.cost != null && !cost.trim()) setCost(String(result.cost));
      if (result.notes && !notes.trim()) setNotes(result.notes);
    } finally {
      setScanning(false);
    }
  };

  const onPickAttachment = (item: { kind: AttachmentItem['kind']; uri: string; name?: string }) => {
    setAttachments((prev) => [...prev, { id: uuidv4(), ...item }]);
    // Wait a frame so the new tile has actually laid out before scrolling —
    // otherwise this scrolls to the end as it was before the tile appeared.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    if (item.kind === 'image') {
      void autoFillFromPhoto(item.uri);
    }
  };

  const isMod = type === 'mod';

  const onSave = async () => {
    setError(null);

    let nextDueDateIso: string | null = null;
    if (!isMod && nextDueDate.trim()) {
      const parsed = new Date(nextDueDate.trim());
      if (Number.isNaN(parsed.getTime())) {
        setError('Couldn’t understand that due date — try YYYY-MM-DD.');
        return;
      }
      nextDueDateIso = parsed.toISOString();
    }

    setSaving(true);
    try {
      await createMaintenanceRecord({
        bike_id: bikeId,
        type,
        performed_at: new Date().toISOString(),
        odometer_km: odometer.trim() ? distanceToMeters(Number(odometer), units) / 1000 : null,
        cost: cost.trim() ? Number(cost) : null,
        notes: notes.trim() || null,
        next_due_odometer_km:
          !isMod && nextDueOdometer.trim() ? distanceToMeters(Number(nextDueOdometer), units) / 1000 : null,
        next_due_date: nextDueDateIso,
        attachments: attachments.map((a) => ({ uri: a.uri, kind: a.kind })),
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
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>
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
              Odometer ({distanceUnitLabel(units)})
            </ThemedText>
            <TextInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder={units === 'imperial' ? 'e.g. 7800' : 'e.g. 12500'}
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
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
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
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

            {!isMod ? (
              <>
                <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
                  Next Due (optional)
                </ThemedText>
                <TextInput
                  value={nextDueOdometer}
                  onChangeText={setNextDueOdometer}
                  placeholder={`Odometer, e.g. 15000 (${distanceUnitLabel(units)})`}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  style={inputStyle}
                />
                <TextInput
                  value={nextDueDate}
                  onChangeText={setNextDueDate}
                  placeholder="Date, e.g. 2026-12-01"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                />
              </>
            ) : null}

            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
              Attachments
            </ThemedText>
            <AttachmentPicker
              attachments={attachments}
              onPick={onPickAttachment}
              onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            />
            {scanning ? (
              <ThemedText type="small" themeColor="textSecondary">
                Reading photo and filling in what it finds…
              </ThemedText>
            ) : null}

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <KeyboardDoneAccessory />

      <SelectSheet
        visible={typePickerVisible}
        title="Service Type"
        selected={TYPE_LABELS[type]}
        options={TYPE_OPTIONS.map(([, label]) => label)}
        onSelect={(label) => {
          const match = TYPE_OPTIONS.find(([, l]) => l === label);
          if (match) {
            setType(match[0]);
            setTypeTouched(true);
          }
        }}
        onClose={() => setTypePickerVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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

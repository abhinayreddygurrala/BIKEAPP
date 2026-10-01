import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AttachmentPicker } from '@/components/maintenance/AttachmentPicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { MAINTENANCE_TYPE_LABELS } from '@/features/maintenance/maintenanceMath';
import { distanceToMeters, distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import {
  addMaintenanceAttachment,
  deleteMaintenanceRecord,
  getMaintenanceRecord,
  removeMaintenanceAttachment,
  updateMaintenanceRecord,
  type AttachmentKind,
  type MaintenanceRecord,
  type MaintenanceType,
} from '@/services/maintenanceService';

const TYPE_LABELS = MAINTENANCE_TYPE_LABELS;
const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [MaintenanceType, string][];

export default function EditServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();

  const [record, setRecord] = useState<MaintenanceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<MaintenanceType>('oil_change');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDueOdometer, setNextDueOdometer] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    getMaintenanceRecord(id)
      .then((r) => {
        setRecord(r);
        if (r) {
          setType(r.type);
          setOdometer(r.odometer_km != null ? formatDistance(r.odometer_km * 1000, units) : '');
          setCost(r.cost != null ? String(r.cost) : '');
          setNotes(r.notes ?? '');
          setNextDueOdometer(
            r.next_due_odometer_km != null ? formatDistance(r.next_due_odometer_km * 1000, units) : ''
          );
          // Stored as a full ISO timestamp — trim to the date the field
          // actually edits, matching the YYYY-MM-DD the placeholder asks for.
          setNextDueDate(r.next_due_date ? r.next_due_date.slice(0, 10) : '');
        }
      })
      .finally(() => setLoading(false));
    // units is read once here to pre-fill in whatever unit is active right
    // now, not meant to re-convert an already-edited field if units flip
    // elsewhere while this form is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (!record) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Service record not found.
        </ThemedText>
      </ThemedView>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onPickAttachment = async (item: { kind: AttachmentKind; uri: string; name?: string }) => {
    setError(null);
    setAttachmentBusy(true);
    try {
      const saved = await addMaintenanceAttachment(record.id, item.uri, item.kind);
      setRecord((prev) => (prev ? { ...prev, attachments: [...prev.attachments, saved] } : prev));
      // Wait a frame so the new tile has actually laid out before scrolling
      // — otherwise this scrolls to the end as it was before the tile appeared.
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add attachment');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const onRemoveAttachment = async (attachmentId: string) => {
    const target = record.attachments.find((a) => a.id === attachmentId);
    if (!target) return;
    setError(null);
    setAttachmentBusy(true);
    try {
      await removeMaintenanceAttachment(target);
      setRecord((prev) => (prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove attachment');
    } finally {
      setAttachmentBusy(false);
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
      await updateMaintenanceRecord(record.id, {
        type,
        odometer_km: odometer.trim() ? distanceToMeters(Number(odometer), units) / 1000 : null,
        cost: cost.trim() ? Number(cost) : null,
        notes: notes.trim() || null,
        next_due_odometer_km:
          !isMod && nextDueOdometer.trim() ? distanceToMeters(Number(nextDueOdometer), units) / 1000 : null,
        next_due_date: nextDueDateIso,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete Service Record', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setDeleting(true);
          try {
            await deleteMaintenanceRecord(record);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete');
            setDeleting(false);
          }
        },
      },
    ]);
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
              attachments={record.attachments.map((a) => ({ id: a.id, kind: a.kind, uri: a.uri }))}
              onPick={onPickAttachment}
              onRemove={onRemoveAttachment}
              disabled={attachmentBusy}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton label="Save" onPress={onSave} loading={saving} style={styles.saveButton} />
            <PrimaryButton
              label="Delete Service Record"
              variant="danger"
              onPress={onDelete}
              loading={deleting}
              style={styles.deleteButton}
            />
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
          if (match) setType(match[0]);
        }}
        onClose={() => setTypePickerVisible(false)}
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
  deleteButton: {
    marginTop: Spacing.two,
  },
});

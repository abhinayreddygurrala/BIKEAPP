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
import {
  buildExpenseScanSchema,
  EXPENSE_CATEGORY_FIELDS,
  EXPENSE_CATEGORY_LABELS,
  parseOptionalDateInput,
  type ExpenseScanResult,
} from '@/features/maintenance/maintenanceMath';
import { useTheme } from '@/hooks/use-theme';
import { uuidv4 } from '@/lib/uuid';
import { createExpense, type ExpenseCategory } from '@/services/expenseService';
import { scanDocument } from '@/services/receiptScanService';

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export default function NewExpenseScreen() {
  const { bikeId } = useLocalSearchParams<{ bikeId: string }>();
  const theme = useTheme();

  const [category, setCategory] = useState<ExpenseCategory>('insurance');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [provider, setProvider] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  // Held locally and only copied into permanent storage at Save time — the
  // expense these would attach to doesn't exist yet.
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const fields = EXPENSE_CATEGORY_FIELDS[category];
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  // Only fills a field that's still empty — the model augments what you
  // haven't typed yet, it never overwrites something you already entered.
  const autoFillFromPhoto = async (uri: string) => {
    setScanning(true);
    try {
      const schema = buildExpenseScanSchema(category);
      const result = await scanDocument<ExpenseScanResult>(
        uri,
        `Extract the fields from this photo of a ${EXPENSE_CATEGORY_LABELS[category].toLowerCase()} document.`,
        schema
      );
      if (!result) return;
      if (result.provider && !provider.trim()) setProvider(result.provider);
      if (result.referenceNumber && !referenceNumber.trim()) setReferenceNumber(result.referenceNumber);
      if (result.periodStart && !periodStart.trim()) setPeriodStart(result.periodStart);
      if (result.periodEnd && !periodEnd.trim()) setPeriodEnd(result.periodEnd);
      if (result.description && !description.trim()) setDescription(result.description);
      if (result.amount != null && !amount.trim()) setAmount(String(result.amount));
    } finally {
      setScanning(false);
    }
  };

  const onPickAttachment = (item: { kind: AttachmentItem['kind']; uri: string; name?: string }) => {
    setAttachments((prev) => [...prev, { id: uuidv4(), ...item }]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    if (item.kind === 'image') {
      void autoFillFromPhoto(item.uri);
    }
  };

  const onSave = async () => {
    setError(null);
    if (!amount.trim() || Number.isNaN(Number(amount))) {
      setError('Enter an amount');
      return;
    }

    const periodStartResult = fields.showPeriodStart
      ? parseOptionalDateInput(periodStart)
      : ({ ok: true, iso: null } as const);
    if (!periodStartResult.ok) {
      setError('Couldn’t understand the coverage start date — try YYYY-MM-DD.');
      return;
    }
    const periodEndResult = fields.showPeriodEnd
      ? parseOptionalDateInput(periodEnd)
      : ({ ok: true, iso: null } as const);
    if (!periodEndResult.ok) {
      setError(`Couldn’t understand the ${fields.periodEndLabel.toLowerCase() || 'date'} — try YYYY-MM-DD.`);
      return;
    }

    setSaving(true);
    try {
      await createExpense({
        bike_id: bikeId,
        category,
        description: description.trim() || null,
        amount: Number(amount),
        incurred_at: new Date().toISOString(),
        notes: null,
        provider: fields.showProvider && provider.trim() ? provider.trim() : null,
        reference_number: fields.showReference && referenceNumber.trim() ? referenceNumber.trim() : null,
        period_start: periodStartResult.iso,
        period_end: periodEndResult.iso,
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
              Category
            </ThemedText>
            <PrimaryButton
              label={EXPENSE_CATEGORY_LABELS[category]}
              variant="muted"
              style={styles.leftAligned}
              onPress={() => setCategoryPickerVisible(true)}
            />

            {fields.showProvider ? (
              <>
                <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
                  {fields.providerLabel}
                </ThemedText>
                <TextInput
                  value={provider}
                  onChangeText={setProvider}
                  placeholder={fields.providerPlaceholder}
                  placeholderTextColor={theme.textSecondary}
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  style={inputStyle}
                />
              </>
            ) : null}

            {fields.showReference ? (
              <>
                <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
                  {fields.referenceLabel}
                </ThemedText>
                <TextInput
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                  placeholder={fields.referencePlaceholder}
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  style={inputStyle}
                />
              </>
            ) : null}

            {fields.showPeriodStart ? (
              <>
                <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
                  Coverage Starts
                </ThemedText>
                <TextInput
                  value={periodStart}
                  onChangeText={setPeriodStart}
                  placeholder="e.g. 2026-10-01"
                  placeholderTextColor={theme.textSecondary}
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  style={inputStyle}
                />
              </>
            ) : null}

            {fields.showPeriodEnd ? (
              <>
                <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
                  {fields.periodEndLabel}
                </ThemedText>
                <TextInput
                  value={periodEnd}
                  onChangeText={setPeriodEnd}
                  placeholder="e.g. 2027-04-01"
                  placeholderTextColor={theme.textSecondary}
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  style={inputStyle}
                />
              </>
            ) : null}

            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
              Description
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. 6-month premium"
              placeholderTextColor={theme.textSecondary}
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              style={inputStyle}
            />

            <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
              Amount
            </ThemedText>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 210.00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              style={inputStyle}
            />

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
        visible={categoryPickerVisible}
        title="Expense Category"
        selected={EXPENSE_CATEGORY_LABELS[category]}
        options={CATEGORY_OPTIONS.map(([, label]) => label)}
        onSelect={(label) => {
          const match = CATEGORY_OPTIONS.find(([, l]) => l === label);
          if (match) setCategory(match[0]);
        }}
        onClose={() => setCategoryPickerVisible(false)}
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
  leftAligned: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

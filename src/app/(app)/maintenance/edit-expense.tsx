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
import {
  EXPENSE_CATEGORY_FIELDS,
  EXPENSE_CATEGORY_LABELS,
  parseOptionalDateInput,
} from '@/features/maintenance/maintenanceMath';
import { useTheme } from '@/hooks/use-theme';
import {
  addExpenseAttachment,
  deleteExpense,
  getExpense,
  removeExpenseAttachment,
  updateExpense,
  type AttachmentKind,
  type Expense,
  type ExpenseCategory,
} from '@/services/expenseService';

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ExpenseCategory>('insurance');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [provider, setProvider] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    getExpense(id)
      .then((e) => {
        setExpense(e);
        if (e) {
          setCategory(e.category);
          setProvider(e.provider ?? '');
          setReferenceNumber(e.reference_number ?? '');
          // Stored as a full ISO timestamp — trim to the date the field
          // actually edits, matching the YYYY-MM-DD the placeholder asks for.
          setPeriodStart(e.period_start ? e.period_start.slice(0, 10) : '');
          setPeriodEnd(e.period_end ? e.period_end.slice(0, 10) : '');
          setDescription(e.description ?? '');
          setAmount(String(e.amount));
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (!expense) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default" themeColor="textSecondary">
          Expense not found.
        </ThemedText>
      </ThemedView>
    );
  }

  const fields = EXPENSE_CATEGORY_FIELDS[category];
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onPickAttachment = async (item: { kind: AttachmentKind; uri: string; name?: string }) => {
    setError(null);
    setAttachmentBusy(true);
    try {
      const saved = await addExpenseAttachment(expense.id, item.uri, item.kind);
      setExpense((prev) => (prev ? { ...prev, attachments: [...prev.attachments, saved] } : prev));
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add attachment');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const onRemoveAttachment = async (attachmentId: string) => {
    const target = expense.attachments.find((a) => a.id === attachmentId);
    if (!target) return;
    setError(null);
    setAttachmentBusy(true);
    try {
      await removeExpenseAttachment(target);
      setExpense((prev) => (prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove attachment');
    } finally {
      setAttachmentBusy(false);
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
      await updateExpense(expense.id, {
        category,
        description: description.trim() || null,
        amount: Number(amount),
        provider: fields.showProvider && provider.trim() ? provider.trim() : null,
        reference_number: fields.showReference && referenceNumber.trim() ? referenceNumber.trim() : null,
        period_start: periodStartResult.iso,
        period_end: periodEndResult.iso,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete Expense', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteExpense(expense);
            router.back();
          } catch (e) {
            console.error('[EditExpenseScreen] failed to delete', e);
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
              attachments={expense.attachments.map((a) => ({ id: a.id, kind: a.kind, uri: a.uri }))}
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
              label="Delete Expense"
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

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { Spacing } from '@/constants/theme';
import { EXPENSE_CATEGORY_LABELS } from '@/features/maintenance/maintenanceMath';
import { useTheme } from '@/hooks/use-theme';
import { createExpense, type ExpenseCategory } from '@/services/expenseService';

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export default function NewExpenseScreen() {
  const { bikeId } = useLocalSearchParams<{ bikeId: string }>();
  const theme = useTheme();

  const [category, setCategory] = useState<ExpenseCategory>('insurance');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSave = async () => {
    setError(null);
    if (!amount.trim() || Number.isNaN(Number(amount))) {
      setError('Enter an amount');
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

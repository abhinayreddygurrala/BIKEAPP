import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { MOTORCYCLE_BRANDS, OTHER_OPTION, POPULAR_MAKE_COUNT } from '@/constants/motorcycleBrands';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createBike } from '@/services/bikesService';

const EARLIEST_YEAR = 1992;
const CURRENT_YEAR = new Date().getFullYear();
// Newest first — most bikes people are adding are recent ones.
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - EARLIEST_YEAR + 1 }, (_, i) => String(CURRENT_YEAR - i));

const MAKE_SECTIONS = [
  { title: 'Popular', options: MOTORCYCLE_BRANDS.slice(0, POPULAR_MAKE_COUNT).map((b) => b.make) },
  { title: 'More Brands', options: MOTORCYCLE_BRANDS.slice(POPULAR_MAKE_COUNT).map((b) => b.make) },
  { options: [OTHER_OPTION] },
];

export default function NewBikeScreen() {
  const theme = useTheme();
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [makeIsOther, setMakeIsOther] = useState(false);
  const [model, setModel] = useState('');
  const [modelIsOther, setModelIsOther] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [makePickerVisible, setMakePickerVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];
  const modelsForMake = MOTORCYCLE_BRANDS.find((b) => b.make === make)?.models ?? [];

  const onSelectMake = (value: string) => {
    setModel('');
    setModelIsOther(false);
    if (value === OTHER_OPTION) {
      setMakeIsOther(true);
      setMake('');
    } else {
      setMakeIsOther(false);
      setMake(value);
    }
  };

  const onSelectModel = (value: string) => {
    if (value === OTHER_OPTION) {
      setModelIsOther(true);
      setModel('');
    } else {
      setModelIsOther(false);
      setModel(value);
    }
  };

  const onSubmit = async () => {
    const finalName = name.trim() || [year, make, model].filter(Boolean).join(' ');
    if (!finalName) {
      setError('Enter at least a make or a nickname');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createBike({
        name: finalName,
        make: make.trim() || null,
        model: model.trim() || null,
        year: year ? Number(year) : null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bike');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <Pressable onPress={() => setYearPickerVisible(true)} style={[inputStyle, styles.pickerRow]}>
          <ThemedText type="default" themeColor={year ? 'text' : 'textSecondary'}>
            {year || 'Year'}
          </ThemedText>
        </Pressable>

        {makeIsOther ? (
          <TextInput
            value={make}
            onChangeText={setMake}
            placeholder="Make"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            autoFocus
          />
        ) : (
          <Pressable onPress={() => setMakePickerVisible(true)} style={[inputStyle, styles.pickerRow]}>
            <ThemedText type="default" themeColor={make ? 'text' : 'textSecondary'}>
              {make || 'Make'}
            </ThemedText>
          </Pressable>
        )}

        {modelIsOther ? (
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder="Model"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            autoFocus
          />
        ) : (
          <Pressable
            onPress={() => setModelPickerVisible(true)}
            disabled={!make}
            style={[inputStyle, styles.pickerRow, !make && styles.disabled]}>
            <ThemedText type="default" themeColor={model ? 'text' : 'textSecondary'}>
              {model || (make ? 'Model' : 'Select a make first')}
            </ThemedText>
          </Pressable>
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nickname for your beast (optional)"
          placeholderTextColor={theme.textSecondary}
          style={[inputStyle, styles.nicknameInput]}
        />

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Save" onPress={onSubmit} loading={loading} />
      </SafeAreaView>

      <SelectSheet
        visible={yearPickerVisible}
        title="Select Year"
        options={YEAR_OPTIONS}
        selected={year}
        onSelect={setYear}
        onClose={() => setYearPickerVisible(false)}
      />
      <SelectSheet
        visible={makePickerVisible}
        title="Select Make"
        sections={MAKE_SECTIONS}
        selected={makeIsOther ? OTHER_OPTION : make}
        onSelect={onSelectMake}
        onClose={() => setMakePickerVisible(false)}
      />
      <SelectSheet
        visible={modelPickerVisible}
        title="Select Model"
        options={[...modelsForMake, OTHER_OPTION]}
        selected={modelIsOther ? OTHER_OPTION : model}
        onSelect={onSelectModel}
        onClose={() => setModelPickerVisible(false)}
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
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  pickerRow: {
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  nicknameInput: {
    marginTop: Spacing.two,
  },
});

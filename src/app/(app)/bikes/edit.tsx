import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectSheet } from '@/components/ui/SelectSheet';
import { MOTORCYCLE_BRANDS, OTHER_OPTION, POPULAR_MAKE_COUNT } from '@/constants/motorcycleBrands';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { distanceToMeters, distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useTheme } from '@/hooks/use-theme';
import { getBike, updateBike } from '@/services/bikesService';

const EARLIEST_YEAR = 1992;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - EARLIEST_YEAR + 1 }, (_, i) => String(CURRENT_YEAR - i));

const MAKE_SECTIONS = [
  { title: 'Popular', options: MOTORCYCLE_BRANDS.slice(0, POPULAR_MAKE_COUNT).map((b) => b.make) },
  { title: 'More Brands', options: MOTORCYCLE_BRANDS.slice(POPULAR_MAKE_COUNT).map((b) => b.make) },
  { options: [OTHER_OPTION] },
];

export default function EditBikeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { units } = useSettings();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [makeIsOther, setMakeIsOther] = useState(false);
  const [model, setModel] = useState('');
  const [modelIsOther, setModelIsOther] = useState(false);
  const [name, setName] = useState('');
  const [odometer, setOdometer] = useState('');
  const [vin, setVin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [makePickerVisible, setMakePickerVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    getBike(id)
      .then((bike) => {
        if (!bike) return;
        const knownMake = MOTORCYCLE_BRANDS.some((b) => b.make === bike.make);
        const knownModel = MOTORCYCLE_BRANDS.find((b) => b.make === bike.make)?.models.includes(bike.model ?? '');
        setYear(bike.year ? String(bike.year) : '');
        setMake(bike.make ?? '');
        setMakeIsOther(!!bike.make && !knownMake);
        setModel(bike.model ?? '');
        setModelIsOther(!!bike.model && !knownModel);
        setName(bike.name);
        setOdometer(bike.current_odometer_km != null ? formatDistance(bike.current_odometer_km * 1000, units) : '');
        setVin(bike.vin ?? '');
      })
      .finally(() => setLoading(false));
    // units is read once here to pre-fill in whatever unit is active right
    // now, not meant to re-convert an already-edited field if units flip
    // elsewhere while this form is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const onSave = async () => {
    if (!id) return;
    const finalName = name.trim() || [year, make, model].filter(Boolean).join(' ');
    if (!finalName) {
      setError('Enter at least a make or a nickname');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateBike(id, {
        name: finalName,
        make: make.trim() || null,
        model: model.trim() || null,
        year: year ? Number(year) : null,
        current_odometer_km: odometer.trim() ? distanceToMeters(Number(odometer), units) / 1000 : null,
        vin: vin.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save bike');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ThemedView style={styles.flex} />;
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
          style={[inputStyle, styles.fieldSpacing]}
        />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.label}>
          Current Odometer ({distanceUnitLabel(units)})
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
          VIN (optional)
        </ThemedText>
        <TextInput
          value={vin}
          onChangeText={(v) => setVin(v.toUpperCase())}
          placeholder="Vehicle ID number"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.one,
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
  fieldSpacing: {
    marginTop: Spacing.two,
  },
  label: {
    marginTop: Spacing.three,
  },
  saveButton: {
    marginTop: Spacing.four,
  },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createBike } from '@/services/bikesService';

export default function NewBikeScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createBike({
        name: name.trim(),
        make: make.trim() || null,
        model: model.trim() || null,
        year: year.trim() ? Number(year.trim()) : null,
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
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name (e.g. My Ducati)"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={make}
          onChangeText={setMake}
          placeholder="Make"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={model}
          onChangeText={setModel}
          placeholder="Model"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={year}
          onChangeText={setYear}
          placeholder="Year"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          style={inputStyle}
        />

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}

        <PrimaryButton label="Save" onPress={onSubmit} loading={loading} />
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
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
});

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { useTheme } from '@/hooks/use-theme';

export type FormFieldProps = TextInputProps & {
  label: string;
  /** Shown in red under the field and outlines it. Takes priority over `hint`. */
  error?: string | null;
  hint?: string | null;
  hintTone?: 'neutral' | 'good' | 'bad';
  /** Masks the text and adds a Show/Hide button. */
  password?: boolean;
};

export function FormField({ label, error, hint, hintTone = 'neutral', password, style, ...inputProps }: FormFieldProps) {
  const theme = useTheme();
  const { textScale } = useSettings();
  const [revealed, setRevealed] = useState(false);

  const hintColor = hintTone === 'good' ? theme.success : hintTone === 'bad' ? theme.danger : theme.textSecondary;

  return (
    <View style={styles.wrapper}>
      <ThemedText type="statLabel" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : 'transparent' },
        ]}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={password && !revealed}
          {...inputProps}
          style={[styles.input, { color: theme.text, fontSize: 16 * textScale }, style]}
        />
        {password ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}>
            <ThemedText type="smallBold" themeColor="accent">
              {revealed ? 'Hide' : 'Show'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" style={{ color: hintColor }}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.three,
  },
});

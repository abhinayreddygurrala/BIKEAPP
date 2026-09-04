import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'accent' | 'danger' | 'muted';
  loading?: boolean;
};

export function PrimaryButton({
  label,
  variant = 'accent',
  loading = false,
  disabled,
  style,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'accent' ? theme.accent : variant === 'danger' ? theme.danger : theme.backgroundElement;
  const textColor = variant === 'muted' ? theme.text : Colors.dark.accentText;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        { backgroundColor },
        (disabled || loading) && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});

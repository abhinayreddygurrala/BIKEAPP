import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Shadows, Spacing } from '@/constants/theme';
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
  onPressIn,
  onPressOut,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const backgroundColor =
    variant === 'accent' ? theme.accent : variant === 'danger' ? theme.danger : theme.backgroundElement;
  const textColor = variant === 'muted' ? theme.text : Colors.dark.accentText;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={(state) => (typeof style === 'function' ? style(state) : style)}
      {...rest}>
      <Animated.View
        style={[
          styles.button,
          transition,
          { backgroundColor },
          // Tint the shadow with the button's own color for a soft glow
          // rather than a plain black drop shadow — flatten it on press so
          // the button reads as being pushed into the surface, not lifted.
          !isDisabled && Shadows.glow(backgroundColor),
          isDisabled && styles.disabled,
          !isDisabled && pressed && styles.pressed,
          !isDisabled && pressed && styles.pressedShadow,
        ]}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <ThemedText type="smallBold" style={{ color: textColor }}>
            {label}
          </ThemedText>
        )}
      </Animated.View>
    </Pressable>
  );
}

// cubicBezier(...) is the runtime-correct way to pass a custom easing curve
// (verified against react-native-reanimated's normalizeTimingFunction source
// — a raw 'cubic-bezier(...)' string throws at runtime, it only accepts the
// named presets). Animated.View's shipped .d.ts still types this field
// against react-native core's unrelated, narrower transitionTimingFunction
// (a different, non-Reanimated view-transition prop that happens to share
// the name), so the cast below only works around a type-declaration gap,
// not a real mismatch — the object shape is otherwise exactly what
// SingleCSSTransitionSettings expects.
const transition = {
  transitionProperty: 'transform' as const,
  transitionDuration: '120ms',
  transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1) as unknown as string,
};

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1 }],
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  pressedShadow: {
    shadowOpacity: 0,
    elevation: 0,
  },
  disabled: {
    opacity: 0.5,
  },
});

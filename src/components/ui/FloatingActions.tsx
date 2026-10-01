import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FloatingActionsProps = {
  children: ReactNode;
  /** Reports this bar's full height, so the list behind it can leave that much room at its end. */
  onHeightChange: (height: number) => void;
};

/**
 * Buttons pinned to the bottom of a screen, floating over a list that runs
 * all the way down behind them. Content fades out beneath the buttons rather
 * than being cut off on a hard line above them.
 *
 * Place it last inside a `flex: 1` container that also holds the list, and
 * give the list `paddingBottom` equal to the reported height.
 */
export function FloatingActions({ children, onHeightChange }: FloatingActionsProps) {
  const theme = useTheme();

  return (
    <View style={styles.bar} pointerEvents="box-none" onLayout={(e) => onHeightChange(e.nativeEvent.layout.height)}>
      <View
        pointerEvents="none"
        style={[
          styles.fade,
          { experimental_backgroundImage: `linear-gradient(to bottom, ${withZeroAlpha(theme.background)}, ${theme.background})` },
        ]}
      />
      <View style={[styles.buttons, { backgroundColor: theme.background }]}>{children}</View>
      {/* Fills the strip behind the tab bar / home indicator — this native
          inset knows the tab bar's height, which plain JS insets don't. */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.background }} />
    </View>
  );
}

/** '#0B0B0D' -> 'rgba(11,11,13,0)': the same colour, fully transparent, so a fade into it has no gray midpoint. */
function withZeroAlpha(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},0)`;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  fade: {
    height: Spacing.five,
  },
  buttons: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});

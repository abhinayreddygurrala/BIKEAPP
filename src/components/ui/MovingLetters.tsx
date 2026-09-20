import { useMemo } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export type MovingLettersProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Per-letter delay. 30–80ms reads as a wave; outside that it's either simultaneous or sluggish. */
  staggerMs?: number;
};

/**
 * A one-time letter-by-letter entrance (tobiasahlin.com/moving-letters,
 * adapted for React Native). This is a delight-tier animation — per the
 * frequency gate, it belongs on a screen seen rarely (sign-in, onboarding,
 * a celebration), never on something revisited dozens of times a day.
 */
export function MovingLetters({ text, style, containerStyle, staggerMs = 40 }: MovingLettersProps) {
  const letters = useMemo(() => text.split(''), [text]);

  return (
    <View style={[{ flexDirection: 'row' }, containerStyle]}>
      {letters.map((letter, index) => (
        <Letter key={`${letter}-${index}`} char={letter} index={index} style={style} staggerMs={staggerMs} />
      ))}
    </View>
  );
}

function Letter({
  char,
  index,
  style,
  staggerMs,
}: {
  char: string;
  index: number;
  style?: StyleProp<TextStyle>;
  staggerMs: number;
}) {
  // Built outside JSX and memoized per index — an inline chain would rebuild
  // the animation builder on every render (see animate-expo's List entrances
  // recipe). No gesture is involved, so this is a timing curve, not a spring.
  const entering = useMemo(
    () => FadeInDown.duration(320).delay(index * staggerMs).easing(EASE_OUT),
    [index, staggerMs]
  );

  return (
    <Animated.Text entering={entering} style={style}>
      {char === ' ' ? ' ' : char}
    </Animated.Text>
  );
}

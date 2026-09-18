import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Apple's exponential-decay projection: where the finger's flick would settle.
function project(velocity: number, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// The further past the top edge, the less the sheet follows.
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export type DragSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: ViewStyle;
};

export function DragSheet({ visible, onClose, children, contentStyle }: DragSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const context = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Delayed-unmount lifecycle (the standard pattern for animating a mount/unmount):
      // the Modal must already exist before the entrance spring below can animate it in.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      translateY.set(withSpring(0, { duration: 300, dampingRatio: 0.8 }));
    } else if (mounted) {
      translateY.set(
        withSpring(SCREEN_HEIGHT, { duration: 300, dampingRatio: 1, overshootClamping: true }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        })
      );
    }
    // Only the visible transition should drive this — translateY/mounted are outputs, not inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onStart(() => {
          context.set(translateY.get());
        })
        .onUpdate((e) => {
          const next = context.get() + e.translationY;
          translateY.set(next >= 0 ? next : rubberband(next, SCREEN_HEIGHT));
        })
        .onEnd((e) => {
          const projected = translateY.get() + project(e.velocityY);
          if (projected > SCREEN_HEIGHT * 0.2) {
            translateY.set(
              withSpring(SCREEN_HEIGHT, {
                duration: 300,
                dampingRatio: 1,
                velocity: e.velocityY,
                overshootClamping: true,
              })
            );
            scheduleOnRN(onClose);
          } else {
            translateY.set(withSpring(0, { duration: 300, dampingRatio: 0.8, velocity: e.velocityY }));
            scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light);
          }
        }),
    [context, onClose, translateY]
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, SCREEN_HEIGHT], [1, 0], Extrapolation.CLAMP),
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={styles.wrap} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <Animated.View style={sheetStyle}>
            <ThemedView type="backgroundElement" style={[styles.sheetInner, contentStyle]}>
              {children}
            </ThemedView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetInner: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    maxHeight: '75%',
  },
});

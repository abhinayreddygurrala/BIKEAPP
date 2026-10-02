import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// Both loaded via require() inside try/catch, not static imports — see
// bikes/[id].tsx for why. Without them the close button falls back to a
// plain dark circle with a text ✕.
let GlassEffect: typeof import('expo-glass-effect') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GlassEffect = require('expo-glass-effect');
} catch (e) {
  console.error('[BikePhotoScreen] expo-glass-effect native module unavailable', e);
}
const glassAvailable = !!GlassEffect?.isGlassEffectAPIAvailable();

let Symbols: typeof import('expo-symbols') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Symbols = require('expo-symbols');
} catch (e) {
  console.error('[BikePhotoScreen] expo-symbols native module unavailable', e);
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
// How far the photo has to be dragged down at normal size before letting go
// closes the viewer. Less than that and it springs back.
const DISMISS_PULL = 80;
// The zoom scale can settle a hair off 1 after a pinch back out.
const NOT_ZOOMED = 1.01;

/**
 * Full-screen bike photo, opened by tapping the photo on the bike page.
 * Pinch or double-tap to zoom (the scroll view's own native zooming), drag
 * down or tap ✕ to close. Presented as a transparent modal, so as the photo
 * is dragged down the black fades and the bike page shows through, like Photos.
 */
export default function BikePhotoScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const zoom = useSharedValue(1);
  const pull = useSharedValue(0);
  // Set once a drag-release starts closing the viewer, so the backdrop stays
  // faded while the photo springs back during the fade-out, instead of going
  // black again.
  const dismissing = useSharedValue(false);
  const lastTapAt = useRef(0);
  const closing = useRef(false);

  // A drag-release and a ✕ tap can both land during the fade-out, and a
  // second back() would pop the bike page as well.
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    router.back();
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (dismissing.value) return;
      zoom.value = e.zoomScale;
      // At normal size the photo exactly fills the scroll view, so pulling it
      // down past the top can only mean "close". Zoomed in, dragging pans.
      pull.value = e.zoomScale <= NOT_ZOOMED ? Math.max(-e.contentOffset.y, 0) : 0;
    },
    onEndDrag: (e) => {
      if (e.zoomScale <= NOT_ZOOMED && -e.contentOffset.y > DISMISS_PULL) {
        dismissing.value = true;
        scheduleOnRN(close);
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, 300], [1, 0.2], Extrapolation.CLAMP),
  }));
  const closeButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, 80], [1, 0], Extrapolation.CLAMP),
  }));

  // Pressable has no double-tap of its own, so time the gap between taps.
  const onTap = (e: GestureResponderEvent) => {
    // zoomToRect is iOS-only (it throws on Android).
    if (Platform.OS !== 'ios') return;
    const now = Date.now();
    if (now - lastTapAt.current > DOUBLE_TAP_MS) {
      lastTapAt.current = now;
      return;
    }
    lastTapAt.current = 0;
    if (zoom.value > NOT_ZOOMED) {
      scrollRef.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
      return;
    }
    // Zoom in centred on the spot that was tapped.
    const zoomWidth = width / DOUBLE_TAP_ZOOM;
    const zoomHeight = height / DOUBLE_TAP_ZOOM;
    const { locationX, locationY } = e.nativeEvent;
    scrollRef.current?.scrollResponderZoomTo({
      x: locationX - zoomWidth / 2,
      y: locationY - zoomHeight / 2,
      width: zoomWidth,
      height: zoomHeight,
      animated: true,
    });
  };

  const textCross = <ThemedText style={styles.closeGlyph}>✕</ThemedText>;
  const closeIcon = Symbols ? (
    <Symbols.SymbolView name="xmark" size={17} weight="semibold" tintColor="#fff" fallback={textCross} />
  ) : (
    textCross
  );

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        minimumZoomScale={1}
        maximumZoomScale={MAX_ZOOM}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ width, height }}>
        <Pressable onPress={onTap} accessibilityRole="image" accessibilityLabel="Bike photo" style={{ width, height }}>
          <Image source={{ uri }} contentFit="contain" style={{ width, height }} />
        </Pressable>
      </Animated.ScrollView>

      <Animated.View style={[styles.closeWrap, { top: insets.top + Spacing.two }, closeButtonStyle]}>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
          {glassAvailable && GlassEffect ? (
            <GlassEffect.GlassView isInteractive colorScheme="dark" style={styles.closeButton}>
              {closeIcon}
            </GlassEffect.GlassView>
          ) : (
            <View style={[styles.closeButton, styles.closeButtonFallback]}>{closeIcon}</View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    backgroundColor: '#000',
  },
  closeWrap: {
    position: 'absolute',
    left: Spacing.three,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeButtonFallback: {
    backgroundColor: 'rgba(40,40,44,0.75)',
  },
  closeGlyph: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 22,
  },
});

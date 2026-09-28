/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Dark, rugged/moto palette. The app forces userInterfaceStyle "dark" (see
// app.config.ts), so `light` isn't reachable today — kept identical to
// `dark` so the Colors[light|dark] shape stays intact for a future
// system-appearance mode without a breaking change.
const moto = {
  text: '#F5F5F7',
  background: '#0B0B0D',
  backgroundElement: '#1C1C1F',
  backgroundSelected: '#26262B',
  textSecondary: '#9A9AA2',
  // A soft, low-contrast hairline — Apple-style surfaces separate with a
  // barely-there border plus a shadow, never a hard line.
  border: 'rgba(245,245,247,0.08)',
  accent: '#FF4B1F',
  accentText: '#FFFFFF',
  danger: '#FF453A',
  success: '#32D74B',
} as const;

// Elevation presets for surfaces that should read as sitting above the
// background (cards, sheets, buttons) rather than flat-printed on it.
// iOS reads shadowColor/Offset/Opacity/Radius; Android reads elevation.
export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    },
    default: { elevation: 6 },
  }),
  raised: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 6,
    },
    default: { elevation: 3 },
  }),
  // Tints the shadow with the pressable's own color (e.g. the accent
  // button) instead of plain black — reads as a soft glow, a common
  // premium/iOS detail on filled buttons.
  glow: (color: string) =>
    Platform.select({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      default: { elevation: 4 },
    }),
} as const;

export const Colors = {
  light: moto,
  dark: moto,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

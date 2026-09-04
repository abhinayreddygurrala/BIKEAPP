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
  border: '#2E2E33',
  accent: '#FF4B1F',
  accentText: '#FFFFFF',
  danger: '#FF453A',
  success: '#32D74B',
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

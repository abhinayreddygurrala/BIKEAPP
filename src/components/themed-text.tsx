import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'stat'
    | 'statLabel';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { textScale } = useSettings();

  const flat: TextStyle = StyleSheet.flatten([
    { color: theme[themeColor ?? 'text'] },
    type === 'default' && styles.default,
    type === 'title' && styles.title,
    type === 'small' && styles.small,
    type === 'smallBold' && styles.smallBold,
    type === 'subtitle' && styles.subtitle,
    type === 'link' && styles.link,
    type === 'linkPrimary' && styles.linkPrimary,
    type === 'linkPrimary' && { color: theme.accent },
    type === 'code' && styles.code,
    type === 'stat' && styles.stat,
    type === 'statLabel' && styles.statLabel,
    style,
  ]);

  // The in-app text-size preference. Scaling the flattened result (rather
  // than only the presets above) also catches call sites that override
  // fontSize/lineHeight through `style`. iOS's own Dynamic Type still
  // applies on top of this.
  if (textScale !== 1) {
    if (typeof flat.fontSize === 'number') flat.fontSize *= textScale;
    if (typeof flat.lineHeight === 'number') flat.lineHeight *= textScale;
  }

  return <Text style={flat} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
    letterSpacing: -0.3,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  stat: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

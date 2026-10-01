import { StyleSheet, View, type ViewProps } from 'react-native';

import { Shadows, ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <View
      style={[
        { backgroundColor: theme[type ?? 'background'] },
        // "backgroundElement" is this app's name for a surface that sits
        // above the base background (a card, sheet, row) — give every one
        // of them the same soft elevation + hairline border by default
        // rather than re-declaring it per screen.
        type === 'backgroundElement' && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          ...(scheme === 'dark' ? Shadows.card : Shadows.cardLight),
        },
        style,
      ]}
      {...otherProps}
    />
  );
}

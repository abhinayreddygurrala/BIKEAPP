import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlaceSuggestion } from '@/services/routePlannerService';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Color of the dot in front of the field: green for start, accent for destination. */
  dotColor: string;
  suggestions: PlaceSuggestion[];
  showSuggestions: boolean;
  searching: boolean;
  error: string | null;
  onPick: (suggestion: PlaceSuggestion) => void;
  onFocus: () => void;
  editable?: boolean;
};

/** A place search box with its live suggestions underneath. */
export function PlaceField({
  value,
  onChangeText,
  placeholder,
  dotColor,
  suggestions,
  showSuggestions,
  searching,
  error,
  onPick,
  onFocus,
  editable = true,
}: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          editable={editable}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
        />
        {searching ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
        {!searching && value.length > 0 && editable ? (
          <Pressable onPress={() => onChangeText('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear">
            <ThemedText type="default" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {showSuggestions && suggestions.length > 0 ? (
        <View style={[styles.suggestions, { backgroundColor: theme.backgroundElement }]}>
          {suggestions.map((s, index) => (
            <Pressable
              key={s.id}
              onPress={() => onPick(s)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.suggestion,
                index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="default" numberOfLines={1}>
                {s.title}
              </ThemedText>
              {s.subtitle ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {s.subtitle}
                </ThemedText>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {showSuggestions && error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  suggestions: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.half,
  },
});

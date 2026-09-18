import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DragSheet } from '@/components/ui/DragSheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SelectSheetSection = { title?: string; options: string[] };

export type SelectSheetProps = {
  visible: boolean;
  title: string;
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  /** Either a flat list... */
  options?: string[];
  /** ...or grouped under headers (e.g. "Popular" vs "More Brands"). Takes precedence over `options`. */
  sections?: SelectSheetSection[];
};

export function SelectSheet({
  visible,
  title,
  options,
  sections,
  selected,
  onSelect,
  onClose,
}: SelectSheetProps) {
  const theme = useTheme();
  const resolvedSections = sections ?? [{ options: options ?? [] }];

  return (
    <DragSheet visible={visible} onClose={onClose}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        {title}
      </ThemedText>
      <ScrollView>
        {resolvedSections.map((section, sectionIndex) => (
          <View key={section.title ?? sectionIndex}>
            {section.title ? (
              <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
            ) : null}
            {section.options.map((option) => {
              const isSelected = option === selected;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelect(option);
                    onClose();
                  }}
                  style={[styles.row, isSelected && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="default">{option}</ThemedText>
                  {isSelected ? (
                    <ThemedText type="default" style={{ color: theme.accent }}>
                      ✓
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </DragSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
});

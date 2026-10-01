import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextSizeSlider } from '@/components/ui/TextSizeSlider';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { TEXT_SCALE_LABELS, TEXT_SCALES, type ThemeMode } from '@/features/settings/settingsLocalDb';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function AccessibilityScreen() {
  const { themeMode, setThemeMode, textScale, setTextScale } = useSettings();
  const scaleIndex = TEXT_SCALES.indexOf(textScale);
  // Stable across renders (setTextScale is), so the slider's change reporting
  // never has to be torn down and re-registered in the middle of a drag.
  const onSliderChange = useCallback((index: number) => setTextScale(TEXT_SCALES[index] ?? 1), [setTextScale]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Appearance
          </ThemedText>
          <SegmentedControl value={themeMode} options={THEME_OPTIONS} onChange={setThemeMode} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
            System matches your iPhone’s own Light or Dark setting.
          </ThemedText>

          <ThemedText type="statLabel" themeColor="textSecondary" style={[styles.sectionLabel, styles.sectionGap]}>
            Text Size
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.preview}>
            <ThemedText type="default">
              Drag the slider below to change the text size. Text across Odomap will match what you see here.
            </ThemedText>
          </ThemedView>
          <TextSizeSlider
            steps={TEXT_SCALES.length}
            value={scaleIndex === -1 ? TEXT_SCALES.indexOf(1) : scaleIndex}
            valueLabel={TEXT_SCALE_LABELS[textScale]}
            onChange={onSliderChange}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
            {TEXT_SCALE_LABELS[textScale]}. Your iPhone’s own text size (Settings › Accessibility) is applied on top of
            this.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
  },
  sectionLabel: {
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
  },
  sectionGap: {
    marginTop: Spacing.five,
  },
  caption: {
    marginTop: Spacing.two,
    marginLeft: Spacing.one,
  },
  preview: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
});

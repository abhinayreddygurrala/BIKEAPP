import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DragSheet } from '@/components/ui/DragSheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listBikes, type Bike } from '@/services/bikesService';

export type BikePickerSheetProps = {
  visible: boolean;
  selectedBikeId: string | null;
  onSelect: (bikeId: string | null) => void;
  onClose: () => void;
};

export function BikePickerSheet({ visible, selectedBikeId, onSelect, onClose }: BikePickerSheetProps) {
  const theme = useTheme();
  const [bikes, setBikes] = useState<Bike[]>([]);

  useEffect(() => {
    if (!visible) return;
    listBikes()
      .then(setBikes)
      .catch((e) => console.error('[BikePickerSheet] failed to load bikes', e));
  }, [visible]);

  const options: { id: string | null; name: string }[] = [{ id: null, name: 'No bike' }, ...bikes];

  return (
    <DragSheet visible={visible} onClose={onClose} contentStyle={styles.sheet}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        Select Bike
      </ThemedText>
      {options.map((option) => {
        const selected = option.id === selectedBikeId;
        return (
          <Pressable
            key={option.id ?? 'none'}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(option.id);
              onClose();
            }}
            style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="default">{option.name}</ThemedText>
            {selected ? (
              <ThemedText type="default" style={{ color: theme.accent }}>
                ✓
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </DragSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: Spacing.one,
  },
  title: {
    marginBottom: Spacing.two,
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

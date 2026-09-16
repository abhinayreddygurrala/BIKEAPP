import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
            Select Bike
          </ThemedText>
          {options.map((option) => {
            const selected = option.id === selectedBikeId;
            return (
              <Pressable
                key={option.id ?? 'none'}
                onPress={() => {
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
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.one,
    paddingBottom: Spacing.six,
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

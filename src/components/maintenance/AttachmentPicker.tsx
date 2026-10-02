import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, type AlertButton } from 'react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Loaded via require() inside try/catch, not a static import — see
// src/features/ride-tracking/useLeanAngleTracker.ts for why: native modules
// on this build have intermittently failed to register at launch.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[AttachmentPicker] expo-image-picker native module unavailable', e);
}
let DocumentPicker: typeof import('expo-document-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.error('[AttachmentPicker] expo-document-picker native module unavailable', e);
}

export type AttachmentKind = 'image' | 'pdf';

export type AttachmentItem = {
  id: string;
  kind: AttachmentKind;
  uri: string;
  name?: string;
};

export type AttachmentPickerProps = {
  attachments: AttachmentItem[];
  onPick: (item: { kind: AttachmentKind; uri: string; name?: string }) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
};

const TILE_SIZE = 72;
// Library picks can return dozens of assets in one go — this just keeps a
// single add from silently attaching an entire camera roll.
const MAX_LIBRARY_SELECTION = 10;

export function AttachmentPicker({ attachments, onPick, onRemove, disabled }: AttachmentPickerProps) {
  const theme = useTheme();
  // A picked file — especially a PDF still downloading from iCloud/a cloud
  // provider in the Files app — can take a real, sometimes multi-second
  // while to resolve. Without this the "+" tile just sits there looking
  // unresponsive; this is purely a "something is happening" indicator.
  const [busy, setBusy] = useState(false);
  const isBusy = busy || disabled;

  const pickFromCamera = async () => {
    if (!ImagePicker) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    onPick({ kind: 'image', uri: result.assets[0].uri });
  };

  const pickFromLibrary = async () => {
    if (!ImagePicker) return;
    // No permission check: the system photo picker runs outside the app and
    // hands over just the photos that are chosen, so it works (and opens
    // sooner) even if full photo library access was never granted.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_LIBRARY_SELECTION,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      onPick({ kind: 'image', uri: asset.uri });
    }
  };

  const pickPdf = async () => {
    if (!DocumentPicker) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    onPick({ kind: 'pdf', uri: result.assets[0].uri, name: result.assets[0].name });
  };

  const onAddPress = () => {
    const buttons: AlertButton[] = [
      {
        text: 'Take Photo',
        onPress: async () => {
          setBusy(true);
          try {
            await pickFromCamera();
          } finally {
            setBusy(false);
          }
        },
      },
      {
        text: 'Choose Photos',
        onPress: async () => {
          setBusy(true);
          try {
            await pickFromLibrary();
          } finally {
            setBusy(false);
          }
        },
      },
      {
        text: 'Choose PDF',
        onPress: async () => {
          setBusy(true);
          try {
            await pickPdf();
          } finally {
            setBusy(false);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert('Add Attachment', undefined, buttons);
  };

  const onViewAttachment = async (item: AttachmentItem) => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return;
    await Sharing.shareAsync(item.uri, {
      mimeType: item.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
      UTI: item.kind === 'pdf' ? 'com.adobe.pdf' : 'public.jpeg',
    });
  };

  const onTilePress = (item: AttachmentItem) => {
    Alert.alert(item.kind === 'pdf' ? (item.name ?? 'PDF') : 'Photo', undefined, [
      { text: 'View', onPress: () => onViewAttachment(item) },
      { text: 'Delete', style: 'destructive', onPress: () => onRemove(item.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.grid}>
      {attachments.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.kind === 'pdf' ? `PDF attachment ${item.name ?? ''}` : 'Photo attachment'}
          onPress={() => onTilePress(item)}>
          {item.kind === 'image' ? (
            <Image source={{ uri: item.uri }} contentFit="cover" style={styles.tile} />
          ) : (
            <View style={[styles.tile, styles.pdfTile, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.pdfEmoji}>📄</ThemedText>
            </View>
          )}
        </Pressable>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        disabled={isBusy}
        onPress={onAddPress}
        style={[styles.tile, styles.addTile, { backgroundColor: theme.backgroundElement, opacity: isBusy ? 0.6 : 1 }]}>
        {isBusy ? (
          <ActivityIndicator color={theme.textSecondary} />
        ) : (
          <ThemedText type="title" themeColor="accent" style={styles.addPlus}>
            +
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Spacing.two,
  },
  pdfTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfEmoji: {
    fontSize: 28,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {
    fontSize: 28,
    lineHeight: 32,
  },
});

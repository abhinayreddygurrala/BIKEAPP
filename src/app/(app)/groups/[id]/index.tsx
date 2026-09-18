import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { getGroup, type Group } from '@/services/groupsService';
import {
  listMessages,
  sendImageMessage,
  sendTextMessage,
  subscribeToMessages,
  type GroupMessage,
} from '@/services/groupMessagesService';

// Loaded via require() inside try/catch, not a static import — see
// src/features/ride-tracking/useLeanAngleTracker.ts for why: native modules
// on this build have intermittently failed to register at launch, and a
// static import throwing here would crash navigation app-wide, not just
// this screen.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[GroupChatScreen] expo-image-picker native module unavailable', e);
}

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const theme = useTheme();

  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Ids already mounted once, so a message doesn't replay its entrance
  // animation when it scrolls out of the FlatList's window and back in.
  const seenMessageIds = useRef(new Set<string>());

  useEffect(() => {
    if (!id) return;
    getGroup(id).then(setGroup);
    listMessages(id)
      .then((initial) => {
        initial.forEach((m) => seenMessageIds.current.add(m.id));
        setMessages(initial);
      })
      .finally(() => setLoaded(true));

    const unsubscribe = subscribeToMessages(id, (message) => {
      setMessages((prev) => [...prev, message]);
    });
    return unsubscribe;
  }, [id]);

  const onSendText = async () => {
    if (!draft.trim() || !id) return;
    const text = draft.trim();
    setDraft('');
    try {
      await sendTextMessage(id, text);
    } catch (e) {
      console.error('[GroupChatScreen] failed to send message', e);
    }
  };

  const onSendImage = async () => {
    if (!id || !ImagePicker) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    setSending(true);
    try {
      await sendImageMessage(id, result.assets[0].uri);
    } catch (e) {
      console.error('[GroupChatScreen] failed to send image', e);
    } finally {
      setSending(false);
    }
  };

  const myId = session?.user.id;

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Group',
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/(app)/groups/[id]/settings', params: { id } })} hitSlop={8}>
              <ThemedText type="default" style={{ color: theme.accent }}>
                Settings
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      <SafeAreaView style={styles.flex}>
        {!loaded ? (
          <ActivityIndicator color="#fff" style={styles.loading} />
        ) : (
          <FlatList
            data={[...messages].reverse()}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <MessageBubble item={item} isMine={item.sender_id === myId} seenIds={seenMessageIds.current} />
            )}
          />
        )}

        <View style={styles.inputRow}>
          <Pressable
            onPress={onSendImage}
            disabled={sending || !ImagePicker}
            style={[styles.attachButton, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="default">📷</ThemedText>
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            onSubmitEditing={onSendText}
            returnKeyType="send"
          />
          <Pressable onPress={onSendText} style={[styles.sendButton, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              Send
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function MessageBubble({
  item,
  isMine,
  seenIds,
}: {
  item: GroupMessage;
  isMine: boolean;
  seenIds: Set<string>;
}) {
  const theme = useTheme();
  const isNew = !seenIds.has(item.id);
  const entering = useMemo(() => (isNew ? FadeIn.duration(200) : undefined), [isNew]);
  const layout = useMemo(() => LinearTransition.duration(200), []);

  useEffect(() => {
    seenIds.add(item.id);
    // Only needs to run once per message id — marks it seen after its first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <Animated.View
      entering={entering}
      layout={layout}
      style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, { backgroundColor: isMine ? theme.accent : theme.backgroundElement }]}>
        {item.kind === 'image' && item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.bubbleImage} resizeMode="cover" />
        ) : (
          <ThemedText type="default" style={isMine ? { color: theme.accentText } : undefined}>
            {item.content}
          </ThemedText>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  sendButton: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

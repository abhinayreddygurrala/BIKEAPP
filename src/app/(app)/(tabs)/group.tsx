import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { joinGroupByCode, listMyGroups, type Group } from '@/services/groupsService';

export default function GroupScreen() {
  const theme = useTheme();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyGroups()
      .then(setGroups)
      .catch((e) => console.error('[GroupScreen] failed to load groups', e))
      .finally(() => setLoaded(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinError(null);
    setJoining(true);
    try {
      const group = await joinGroupByCode(joinCode.trim());
      setJoinCode('');
      router.push({ pathname: '/(app)/groups/[id]', params: { id: group.id } });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Groups
        </ThemedText>

        {!loaded ? (
          <ActivityIndicator color="#fff" style={styles.loading} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            contentContainerStyle={groups.length === 0 ? styles.emptyList : styles.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push({ pathname: '/(app)/groups/[id]', params: { id: item.id } })}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  {item.description ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.description}
                    </ThemedText>
                  ) : null}
                </ThemedView>
              </Pressable>
            )}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
                No groups yet.
              </ThemedText>
            }
          />
        )}

        <View style={styles.joinRow}>
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder="Enter invite code"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <PrimaryButton label="Join" onPress={onJoin} loading={joining} style={styles.joinButton} />
        </View>
        {joinError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {joinError}
          </ThemedText>
        ) : null}

        <Link href="/(app)/groups/new" asChild>
          <PrimaryButton label="Create Group" variant="muted" />
        </Link>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  joinRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  joinButton: {
    paddingHorizontal: Spacing.four,
  },
});

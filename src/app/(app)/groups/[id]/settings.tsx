import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteGroup,
  getGroup,
  leaveGroup,
  listMembers,
  removeMember,
  updateGroup,
  uploadGroupAvatar,
  type Group,
  type GroupMember,
} from '@/services/groupsService';

// See src/app/(app)/groups/[id].tsx for why this is a lazy require, not a
// static import.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.error('[GroupSettingsScreen] expo-image-picker native module unavailable', e);
}

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const theme = useTheme();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getGroup(id), listMembers(id)])
      .then(([groupResult, membersResult]) => {
        setGroup(groupResult);
        setName(groupResult?.name ?? '');
        setDescription(groupResult?.description ?? '');
        setMembers(membersResult);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  const isOwner = group?.owner_id === session?.user.id;

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateGroup(id, { name: name.trim(), description: description.trim() || null });
    } catch (e) {
      console.error('[GroupSettingsScreen] failed to save', e);
    } finally {
      setSaving(false);
    }
  };

  const onChoosePhoto = async () => {
    if (!id || !ImagePicker) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      const url = await uploadGroupAvatar(id, result.assets[0].uri);
      await updateGroup(id, { avatar_url: url });
      setGroup((prev) => (prev ? { ...prev, avatar_url: url } : prev));
    } catch (e) {
      console.error('[GroupSettingsScreen] failed to upload photo', e);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onShareInvite = () => {
    if (!group) return;
    Share.share({
      message: `Join my group "${group.name}" on BikeApp! Open the Groups tab and enter this invite code: ${group.invite_code}`,
    });
  };

  const onRemoveMember = (profileId: string) => {
    if (!id) return;
    Alert.alert('Remove Member', 'Remove this person from the group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeMember(id, profileId);
          setMembers((prev) => prev.filter((m) => m.profile_id !== profileId));
        },
      },
    ]);
  };

  const onLeaveOrDelete = () => {
    if (!id) return;
    if (isOwner) {
      Alert.alert('Delete Group', 'This deletes the group and all its messages for everyone. This can’t be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGroup(id);
            router.dismissTo('/(app)/(tabs)');
          },
        },
      ]);
    } else {
      Alert.alert('Leave Group', 'You can rejoin later with the invite code.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveGroup(id);
            router.dismissTo('/(app)/(tabs)');
          },
        },
      ]);
    }
  };

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </ThemedView>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.content}>
        <Pressable onPress={onChoosePhoto} disabled={!ImagePicker} style={styles.avatarWrap}>
          {uploadingPhoto ? (
            <ActivityIndicator color="#fff" />
          ) : group?.avatar_url ? (
            <Image source={{ uri: group.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default">🏍️</ThemedText>
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Change photo
          </ThemedText>
        </Pressable>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[inputStyle, styles.descriptionInput]}
        />
        <PrimaryButton label="Save" onPress={onSave} loading={saving} variant="muted" />

        <PrimaryButton label="Share Invite Code" onPress={onShareInvite} variant="muted" style={styles.section} />

        <ThemedText type="statLabel" themeColor="textSecondary" style={styles.section}>
          Members
        </ThemedText>
        {members.map((member) => (
          <View key={member.profile_id} style={[styles.memberRow, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="default">{member.profile?.display_name ?? 'Rider'}</ThemedText>
            {isOwner && member.profile_id !== session?.user.id ? (
              <Pressable onPress={() => onRemoveMember(member.profile_id)}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Remove
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ))}

        <PrimaryButton
          label={isOwner ? 'Delete Group' : 'Leave Group'}
          variant="danger"
          onPress={onLeaveOrDelete}
          style={styles.section}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  section: {
    marginTop: Spacing.three,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});

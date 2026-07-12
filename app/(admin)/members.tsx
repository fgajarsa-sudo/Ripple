import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type MemberRow = {
  id: string;
  user_id: string;
  role: 'admin' | 'reviewer' | 'member';
  profiles: { display_name: string | null } | null;
};

type InviteRow = {
  id: string;
  code: string;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
};

const ROLES: MemberRow['role'][] = ['member', 'reviewer', 'admin'];

export default function MembersScreen() {
  const { data: membership } = useMembership();
  const queryClient = useQueryClient();
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  const { data: members } = useQuery({
    queryKey: ['members-admin', membership?.org_id],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, user_id, role, profiles(display_name)')
        .eq('org_id', membership!.org_id)
        .eq('status', 'active')
        .order('role');
      if (error) throw error;
      return data as unknown as MemberRow[];
    },
    enabled: !!membership?.org_id,
  });

  const { data: invites } = useQuery({
    queryKey: ['invites-admin', membership?.org_id],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from('org_invites')
        .select('id, code, use_count, max_uses, expires_at')
        .eq('org_id', membership!.org_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!membership?.org_id,
  });

  const refetchMembers = () => queryClient.invalidateQueries({ queryKey: ['members-admin'] });
  const refetchInvites = () => queryClient.invalidateQueries({ queryKey: ['invites-admin'] });

  const onChangeRole = async (membershipId: string, role: MemberRow['role']) => {
    const { error } = await supabase.from('memberships').update({ role }).eq('id', membershipId);
    if (error) Alert.alert('Error', error.message);
    else refetchMembers();
  };

  const onRemoveMember = (membershipId: string, name: string) => {
    Alert.alert('Remove member?', `${name} will lose access to this group.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('memberships').update({ status: 'removed' }).eq('id', membershipId);
          if (error) Alert.alert('Error', error.message);
          else refetchMembers();
        },
      },
    ]);
  };

  const onCreateInvite = async () => {
    if (!membership?.org_id) return;
    setIsCreatingInvite(true);
    try {
      const { error } = await supabase.rpc('admin_create_invite', { target_org_id: membership.org_id });
      if (error) throw error;
      refetchInvites();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const onRevokeInvite = (id: string) => {
    Alert.alert('Revoke this code?', 'It will no longer work for joining.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('org_invites').delete().eq('id', id);
          if (error) Alert.alert('Error', error.message);
          else refetchInvites();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppHeader
        right={
          <Pressable onPress={() => router.replace('/(member)/home')}>
            <Text style={styles.homeLink}>Home</Text>
          </Pressable>
        }
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>← Admin menu</Text>
        </Pressable>
        <ScreenTitle>Members & invites</ScreenTitle>

        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.hint}>No members yet</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.memberName}>{item.profiles?.display_name ?? 'Unnamed'}</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.roleChip, item.role === r && styles.roleChipActive]}
                    onPress={() => onChangeRole(item.id, r)}
                  >
                    <Text style={[styles.roleChipText, item.role === r && styles.roleChipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => onRemoveMember(item.id, item.profiles?.display_name ?? 'This member')}>
                <Text style={styles.removeLink}>Remove from group</Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.inviteSection}>
              <View style={styles.inviteSectionHeader}>
                <Text style={styles.sectionTitle}>INVITE CODES</Text>
                <PillButton title="New code" onPress={onCreateInvite} loading={isCreatingInvite} />
              </View>
              {(invites ?? []).map((invite) => (
                <View key={invite.id} style={styles.inviteCard}>
                  <QRCode value={invite.code} size={96} color={colors.navy} backgroundColor={colors.card} />
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteCode}>{invite.code}</Text>
                    <Text style={styles.inviteMeta}>
                      Used {invite.use_count}
                      {invite.max_uses ? ` / ${invite.max_uses}` : ''} times
                    </Text>
                    <Pressable onPress={() => onRevokeInvite(invite.id)}>
                      <Text style={styles.removeLink}>Revoke</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {(invites ?? []).length === 0 && <Text style={styles.hint}>No invite codes yet</Text>}
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  backLink: { fontSize: 14, color: colors.teal, marginTop: 8, marginBottom: 4, fontFamily: fonts.body },
  hint: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, textAlign: 'center', marginTop: 12 },
  list: { gap: 12, paddingTop: 12, paddingBottom: 32 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, backgroundColor: colors.card, gap: 8 },
  memberName: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  roleChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  roleChipText: { fontSize: 13, color: colors.teal, textTransform: 'capitalize', fontFamily: fonts.body },
  roleChipTextActive: { color: colors.tealForeground },
  removeLink: { fontSize: 13, color: colors.destructive, fontFamily: fonts.bodySemiBold },
  inviteSection: { marginTop: 24, gap: 12 },
  inviteSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.mutedForeground, letterSpacing: 1 },
  inviteCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.card,
  },
  inviteInfo: { gap: 4, flex: 1 },
  inviteCode: { fontSize: 20, fontFamily: fonts.display, color: colors.navy, letterSpacing: 1 },
  inviteMeta: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
});

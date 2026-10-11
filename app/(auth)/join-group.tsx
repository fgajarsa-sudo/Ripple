import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '../../components/Logo';
import { ErrorText, Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

type PublicOrg = {
  id: string;
  name: string;
  waterbody_name: string | null;
  region: string | null;
};

type Path = 'start' | 'join' | 'solo';

// Joining/creating/switching all go through RPCs (migration 001 + 008) rather than touching
// memberships directly — redeeming an invite has to also bump org_invites.use_count and
// enforce expires_at/max_uses atomically, and every one of these needs to deactivate any
// prior active membership first (one group per user, switching allowed), which is exactly
// what leave_current_org() inside each of these functions handles.
async function redeemInvite(code: string) {
  return supabase.rpc('redeem_org_invite', { invite_code: code });
}

export default function JoinGroup() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<Path>('join');
  const [joinMode, setJoinMode] = useState<'code' | 'directory'>('code');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<PublicOrg[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [listPublicly, setListPublicly] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{ orgId: string; code: string } | null>(null);

  const loadDirectory = useCallback(async () => {
    setIsLoadingDirectory(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, waterbody_name, region')
      .eq('is_listed_publicly', true)
      .eq('status', 'active');
    setIsLoadingDirectory(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setOrgs(data ?? []);
  }, []);

  const onShowDirectory = () => {
    setJoinMode('directory');
    void loadDirectory();
  };

  const onRedeemCode = async () => {
    if (!code.trim()) {
      setErrorMessage('Enter an invite code');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await redeemInvite(code.trim().toUpperCase());
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    // useMembership()'s cached result is still the pre-join "no membership" value — without
    // invalidating it, (member)/_layout.tsx and (admin)/_layout.tsx both read the stale
    // cache on the very next render and redirect straight back here, even though a real
    // membership now exists.
    await queryClient.invalidateQueries({ queryKey: ['membership'] });
    router.replace('/');
  };

  const onJoinFromDirectory = async (orgId: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.rpc('join_public_org', { org_id: orgId });
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['membership'] });
    router.replace('/');
  };

  const onCreateGroup = async () => {
    if (!groupName.trim()) {
      setErrorMessage('Enter a group name');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    const { data, error } = await supabase
      .rpc('create_own_org', { org_name: groupName.trim(), listed_publicly: listPublicly })
      .single();
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    const row = data as { org_id: string; invite_code: string };
    await queryClient.invalidateQueries({ queryKey: ['membership'] });
    setCreatedInvite({ orgId: row.org_id, code: row.invite_code });
  };

  const onCollectSolo = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    // Each user gets their own personal org (migration 010), not membership in one org
    // shared by every solo collector — otherwise everyone's thresholds would be the same
    // set of numbers, which defeats the point of having thresholds at all for a genuinely
    // different collection area.
    const { data: personalOrgId, error } = await supabase.rpc('start_personal_collection');
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['membership'] });
    router.replace({ pathname: '/(admin)/thresholds', params: { orgId: personalOrgId as string } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Logo size={32} />
          <ScreenTitle>Get started</ScreenTitle>
        </View>
        <Pressable onPress={() => supabase.auth.signOut().then(() => router.replace('/(auth)/welcome'))}>
          <Text style={styles.signOutLink}>Sign out</Text>
        </Pressable>
      </View>

      {/* Hidden once a group has actually been created: every path here calls
          leave_current_org() first, so staying reachable after success would let someone tap
          into "Collect on my own" or "Join a group" and silently abandon the group they just
          made — exactly what happened in testing (created a group, switched tabs, lost admin
          access to it with no warning). */}
      {!createdInvite && (
        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, path === 'start' && styles.tabActive]} onPress={() => setPath('start')}>
            <Text style={[styles.tabText, path === 'start' && styles.tabTextActive]}>Start a group</Text>
          </Pressable>
          <Pressable style={[styles.tab, path === 'join' && styles.tabActive]} onPress={() => setPath('join')}>
            <Text style={[styles.tabText, path === 'join' && styles.tabTextActive]}>Join a group</Text>
          </Pressable>
          <Pressable style={[styles.tab, path === 'solo' && styles.tabActive]} onPress={() => setPath('solo')}>
            <Text style={[styles.tabText, path === 'solo' && styles.tabTextActive]}>Collect on my own</Text>
          </Pressable>
        </View>
      )}

      {path === 'start' &&
        (createdInvite ? (
          <View style={styles.section}>
            <Text style={styles.sectionHint}>Your group is ready. Share this code or QR with volunteers:</Text>
            <View style={styles.inviteCard}>
              <QRCode value={createdInvite.code} size={120} color={colors.navy} backgroundColor={colors.card} />
              <Text style={styles.inviteCode}>{createdInvite.code}</Text>
            </View>
            {/* Straight to thresholds, not Home — a brand-new group's thresholds are still
                just the seeded defaults (migration 001), and setting real baselines for the
                group's own lake is the natural next step for whoever just created it. */}
            <PillButton
              title="Set baseline thresholds"
              onPress={() =>
                router.replace({ pathname: '/(admin)/thresholds', params: { orgId: createdInvite.orgId } })
              }
            />
          </View>
        ) : (
          <View style={styles.section}>
            <Input placeholder="Group name" onChangeText={setGroupName} value={groupName} />
            <View style={styles.toggleRow}>
              <Switch value={listPublicly} onValueChange={setListPublicly} trackColor={{ true: colors.teal }} />
              <Text style={styles.toggleText}>List in the public group directory</Text>
            </View>
            {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
            <PillButton title="Create group" onPress={onCreateGroup} loading={isSubmitting} />
          </View>
        ))}

      {path === 'join' && (
        <>
          <View style={styles.subTabRow}>
            <Pressable
              style={[styles.subTab, joinMode === 'code' && styles.subTabActive]}
              onPress={() => setJoinMode('code')}
            >
              <Text style={[styles.subTabText, joinMode === 'code' && styles.subTabTextActive]}>
                Invite code / QR
              </Text>
            </Pressable>
            <Pressable
              style={[styles.subTab, joinMode === 'directory' && styles.subTabActive]}
              onPress={onShowDirectory}
            >
              <Text style={[styles.subTabText, joinMode === 'directory' && styles.subTabTextActive]}>
                Browse groups
              </Text>
            </Pressable>
          </View>

          {joinMode === 'code' ? (
            <View style={styles.section}>
              <Input placeholder="Enter invite code" autoCapitalize="characters" onChangeText={setCode} value={code} />
              {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
              <PillButton title="Join" onPress={onRedeemCode} loading={isSubmitting} />
            </View>
          ) : (
            <View style={styles.section}>
              {isLoadingDirectory ? (
                <ActivityIndicator color={colors.teal} />
              ) : (
                <FlatList
                  data={orgs}
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={<Text style={styles.emptyText}>No public groups listed yet.</Text>}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.orgRow}
                      onPress={() => onJoinFromDirectory(item.id)}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.orgName}>{item.name}</Text>
                      {item.waterbody_name && (
                        <Text style={styles.orgMeta}>
                          {item.waterbody_name}
                          {item.region ? ` · ${item.region}` : ''}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              )}
              {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
            </View>
          )}
        </>
      )}

      {path === 'solo' && (
        <View style={styles.section}>
          <Text style={styles.sectionHint}>
            No group yet? Submit readings on your own — you can join a conservation group later and your
            independent readings stay yours.
          </Text>
          {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
          <PillButton title="Collect independently" onPress={onCollectSolo} loading={isSubmitting} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 24 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signOutLink: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  tabText: { color: colors.teal, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  tabTextActive: { color: colors.tealForeground },
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subTabActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  subTabText: { color: colors.teal, fontFamily: fonts.bodySemiBold },
  subTabTextActive: { color: colors.tealForeground },
  section: { flex: 1, gap: 12 },
  sectionHint: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body, lineHeight: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleText: { fontSize: 14, flexShrink: 1, fontFamily: fonts.body, color: colors.foreground },
  inviteCard: {
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 20,
    backgroundColor: colors.card,
  },
  inviteCode: { fontSize: 22, fontFamily: fonts.bodySemiBold, color: colors.navy, letterSpacing: 2 },
  orgRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  orgName: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  orgMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2, fontFamily: fonts.body },
  emptyText: { textAlign: 'center', color: colors.mutedForeground, marginTop: 24, fontFamily: fonts.body },
});

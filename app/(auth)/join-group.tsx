import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorText, Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

type PublicOrg = {
  id: string;
  name: string;
  waterbody_name: string | null;
  region: string | null;
};

// Joining by code calls this RPC (defined in migration 001) rather than inserting into
// memberships directly, since redeeming an invite must also bump org_invites.use_count
// and enforce expires_at/max_uses atomically.
async function redeemInvite(code: string) {
  return supabase.rpc('redeem_org_invite', { invite_code: code });
}

export default function JoinGroup() {
  const [mode, setMode] = useState<'code' | 'directory'>('code');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<PublicOrg[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

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
    setMode('directory');
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
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <ScreenTitle>Join a group</ScreenTitle>
        <Pressable onPress={() => supabase.auth.signOut().then(() => router.replace('/(auth)/welcome'))}>
          <Text style={styles.signOutLink}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, mode === 'code' && styles.tabActive]}
          onPress={() => setMode('code')}
        >
          <Text style={[styles.tabText, mode === 'code' && styles.tabTextActive]}>
            Invite code / QR
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === 'directory' && styles.tabActive]}
          onPress={onShowDirectory}
        >
          <Text style={[styles.tabText, mode === 'directory' && styles.tabTextActive]}>
            Browse groups
          </Text>
        </Pressable>
      </View>

      {mode === 'code' ? (
        <View style={styles.section}>
          <Input placeholder="Enter invite code" autoCapitalize="characters" onChangeText={setCode} value={code} />
          {/* QR scanning (expo-camera barcode scanner) lands alongside the Phase 1 submit
              flow's camera integration, not here. */}
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
  signOutLink: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  tabText: { color: colors.teal, fontFamily: fonts.bodySemiBold },
  tabTextActive: { color: colors.tealForeground },
  section: { flex: 1, gap: 12 },
  orgRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  orgName: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  orgMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2, fontFamily: fonts.body },
  emptyText: { textAlign: 'center', color: colors.mutedForeground, marginTop: 24, fontFamily: fonts.body },
});

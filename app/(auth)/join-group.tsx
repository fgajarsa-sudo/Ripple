import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    const { error } = await redeemInvite(code.trim());
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
      <Text style={styles.title}>Join a group</Text>

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
          <TextInput
            style={styles.input}
            placeholder="Enter invite code"
            autoCapitalize="characters"
            onChangeText={setCode}
            value={code}
          />
          {/* QR scanning (expo-camera barcode scanner) lands alongside the Phase 1 submit
              flow's camera integration, not here. */}
          {errorMessage && <Text style={styles.formError}>{errorMessage}</Text>}
          <Pressable style={styles.button} onPress={onRedeemCode} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Join</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          {isLoadingDirectory ? (
            <ActivityIndicator />
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
          {errorMessage && <Text style={styles.formError}>{errorMessage}</Text>}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#0f4c5c', marginTop: 12, marginBottom: 16 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c9d3d4',
  },
  tabActive: { backgroundColor: '#0f4c5c', borderColor: '#0f4c5c' },
  tabText: { color: '#0f4c5c', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  section: { flex: 1, gap: 12 },
  input: { borderWidth: 1, borderColor: '#c9d3d4', borderRadius: 10, padding: 14, fontSize: 16 },
  formError: { color: '#b3261e', fontSize: 14, textAlign: 'center' },
  button: { backgroundColor: '#0f4c5c', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  orgRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5eaea' },
  orgName: { fontSize: 16, fontWeight: '600', color: '#0f2a30' },
  orgMeta: { fontSize: 13, color: '#4a5a5f', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#4a5a5f', marginTop: 24 },
});

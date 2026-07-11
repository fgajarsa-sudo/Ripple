import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearPushToken } from '../../lib/registerPushToken';
import { useSession } from '../../lib/SessionProvider';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type Notification = { id: string; title: string; body: string; sent_at: string };

export default function Home() {
  const { session } = useSession();
  const { data: membership } = useMembership();

  const onSignOut = async () => {
    if (session?.user.id) {
      await clearPushToken(session.user.id);
    }
    await supabase.auth.signOut();
  };

  const { data: notifications } = useQuery({
    queryKey: ['notifications', membership?.org_id],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, sent_at')
        .order('sent_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!membership?.org_id,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.orgName}>{membership?.organizations?.name ?? 'Ripple'}</Text>
            {membership?.organizations?.waterbody_name && (
              <Text style={styles.waterbody}>{membership.organizations.waterbody_name}</Text>
            )}
          </View>
          <Pressable onPress={onSignOut}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.submitButton}
        onPress={() => router.push('/(member)/submit/location')}
      >
        <Text style={styles.submitButtonText}>Submit a Reading</Text>
      </Pressable>

      {(membership?.role === 'admin' || membership?.role === 'reviewer') && (
        <Pressable style={styles.reviewButton} onPress={() => router.push('/(reviewer)/queue')}>
          <Text style={styles.reviewButtonText}>Review queue</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>GROUP ALERTS</Text>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.alertsList}
        ListEmptyComponent={<Text style={styles.emptyText}>No alerts yet</Text>}
        renderItem={({ item }) => (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>{item.title}</Text>
            <Text style={styles.alertBody}>{item.body}</Text>
            <Text style={styles.alertDate}>{new Date(item.sent_at).toLocaleDateString()}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  header: { marginTop: 12, marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orgName: { fontSize: 26, fontWeight: '700', color: '#0f4c5c' },
  waterbody: { fontSize: 15, color: '#4a5a5f', marginTop: 2 },
  signOutLink: { fontSize: 14, color: '#4a5a5f', marginTop: 6 },
  submitButton: {
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  reviewButton: {
    borderWidth: 1,
    borderColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  reviewButtonText: { color: '#0f4c5c', fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#4a5a5f', letterSpacing: 0.5, marginBottom: 8 },
  alertsList: { gap: 10, paddingBottom: 24 },
  alertCard: { borderWidth: 1, borderColor: '#e5eaea', borderRadius: 12, padding: 14, gap: 4 },
  alertTitle: { fontSize: 15, fontWeight: '600', color: '#0f2a30' },
  alertBody: { fontSize: 14, color: '#4a5a5f' },
  alertDate: { fontSize: 12, color: '#8a9a9d' },
  emptyText: { textAlign: 'center', color: '#8a9a9d', marginTop: 24 },
});

import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PillButton } from '../../components/ui';
import { countQueuedSubmissions } from '../../lib/offlineQueue';
import { colors, fonts, radius } from '../../lib/theme';
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

  const { data: queuedCount, refetch: refetchQueuedCount } = useQuery({
    queryKey: ['queued-count', session?.user.id],
    queryFn: () => countQueuedSubmissions(session!.user.id),
    enabled: !!session?.user.id,
    refetchInterval: 4000,
  });

  useFocusEffect(
    useCallback(() => {
      void refetchQueuedCount();
    }, [refetchQueuedCount])
  );

  return (
    <View style={styles.root}>
      <AppHeader
        right={
          <Pressable onPress={onSignOut}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        }
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.orgBlock}>
          <Text style={styles.orgName}>{membership?.organizations?.name ?? 'Ripple'}</Text>
          {membership?.organizations?.waterbody_name && (
            <Text style={styles.waterbody}>{membership.organizations.waterbody_name}</Text>
          )}
        </View>

        {!!queuedCount && (
          <View style={styles.queuedChip}>
            <Text style={styles.queuedChipText}>
              ⏳ {queuedCount} reading{queuedCount === 1 ? '' : 's'} queued — will upload when back in coverage
            </Text>
          </View>
        )}

        <PillButton title="Submit a Reading" onPress={() => router.push('/(member)/submit/location')} />

        {(membership?.role === 'admin' || membership?.role === 'reviewer') && (
          <View style={styles.reviewButtonSpacing}>
            <PillButton
              title="Review queue"
              variant="secondary"
              onPress={() => router.push('/(reviewer)/queue')}
            />
          </View>
        )}

        {membership?.role === 'admin' && (
          <View style={styles.reviewButtonSpacing}>
            <PillButton title="Admin" variant="secondary" onPress={() => router.push('/(admin)')} />
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  orgBlock: { marginTop: 8, marginBottom: 20 },
  orgName: { fontFamily: fonts.display, fontSize: 24, color: colors.navy },
  waterbody: { fontSize: 15, color: colors.mutedForeground, marginTop: 2, fontFamily: fonts.body },
  signOutLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  queuedChip: {
    backgroundColor: colors.warn,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 16,
  },
  queuedChipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.warnForeground },
  reviewButtonSpacing: { marginTop: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.mutedForeground,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
  },
  alertsList: { gap: 10, paddingBottom: 24 },
  alertCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    gap: 4,
    backgroundColor: colors.card,
  },
  alertTitle: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  alertBody: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  alertDate: { fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body },
  emptyText: { textAlign: 'center', color: colors.mutedForeground, marginTop: 24, fontFamily: fonts.body },
});

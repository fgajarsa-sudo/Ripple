import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { listQueuedSubmissions, type QueuedSubmission } from '../../lib/offlineQueue';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/SessionProvider';

type SubmissionRow = {
  id: string;
  captured_at: string;
  readings: Record<string, number>;
  ai_urgency: 'low' | 'medium' | 'high' | null;
};

type HistoryItem =
  | { source: 'server'; capturedAt: string; readingCount: number; urgency: SubmissionRow['ai_urgency']; key: string }
  | { source: 'local'; capturedAt: string; readingCount: number; status: QueuedSubmission['status']; key: string };

const QUEUE_STATUS_LABEL: Record<QueuedSubmission['status'], string> = {
  pending: 'Queued — will upload when back in coverage',
  syncing: 'Syncing…',
  failed: 'Sync failed — will retry',
};

export default function History() {
  const { session } = useSession();

  const { data: submissions, refetch: refetchSubmissions } = useQuery({
    queryKey: ['my-submissions', session?.user.id],
    queryFn: async (): Promise<SubmissionRow[]> => {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, captured_at, readings, ai_urgency')
        .order('captured_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!session?.user.id,
  });

  const { data: queued, refetch: refetchQueued } = useQuery({
    queryKey: ['queued-submissions', session?.user.id],
    queryFn: () => listQueuedSubmissions(session!.user.id),
    enabled: !!session?.user.id,
    // Cheap local SQLite read — poll while this screen is open so queued/syncing/failed
    // rows update live as the sync engine works through the queue, without needing a
    // pub-sub wired between offlineQueue and this screen.
    refetchInterval: 4000,
  });

  useFocusEffect(
    useCallback(() => {
      void refetchSubmissions();
      void refetchQueued();
    }, [refetchSubmissions, refetchQueued])
  );

  const items = useMemo<HistoryItem[]>(() => {
    const serverItems: HistoryItem[] = (submissions ?? []).map((s) => ({
      source: 'server',
      capturedAt: s.captured_at,
      readingCount: Object.keys(s.readings ?? {}).length,
      urgency: s.ai_urgency,
      key: s.id,
    }));
    const localItems: HistoryItem[] = (queued ?? []).map((q) => ({
      source: 'local',
      capturedAt: q.capturedAt,
      readingCount: Object.keys(q.readings ?? {}).length,
      status: q.status,
      key: q.syncClientId,
    }));
    return [...localItems, ...serverItems].sort(
      (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
    );
  }, [submissions, queued]);

  return (
    <View style={styles.root}>
      <AppHeader />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Text style={styles.title}>My History</Text>
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No submissions yet</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{new Date(item.capturedAt).toLocaleString()}</Text>
                <Text style={styles.rowMeta}>
                  {item.readingCount} reading{item.readingCount === 1 ? '' : 's'} ·{' '}
                  {item.source === 'server' ? 'Synced' : QUEUE_STATUS_LABEL[item.status]}
                </Text>
              </View>
              {item.source === 'server' && item.urgency && <UrgencyBadge urgency={item.urgency} />}
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
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.navy, marginTop: 8, marginBottom: 16 },
  list: { gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.card,
  },
  rowMain: { gap: 2 },
  rowDate: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  rowMeta: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  emptyText: { textAlign: 'center', color: colors.mutedForeground, marginTop: 40, fontFamily: fonts.body },
});

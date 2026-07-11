import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/SessionProvider';

type SubmissionRow = {
  id: string;
  captured_at: string;
  readings: Record<string, number>;
  ai_urgency: 'low' | 'medium' | 'high' | null;
};

const URGENCY_COLOR: Record<string, string> = {
  high: '#b3261e',
  medium: '#9a6b00',
  low: '#1e7a3c',
};

export default function History() {
  const { session } = useSession();

  const { data: submissions } = useQuery({
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

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>My History</Text>
      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No submissions yet</Text>}
        renderItem={({ item }) => {
          const readingCount = Object.keys(item.readings ?? {}).length;
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{new Date(item.captured_at).toLocaleString()}</Text>
                <Text style={styles.rowMeta}>
                  {readingCount} reading{readingCount === 1 ? '' : 's'} · Synced
                </Text>
              </View>
              {item.ai_urgency && (
                <View style={[styles.badge, { backgroundColor: URGENCY_COLOR[item.ai_urgency] }]}>
                  <Text style={styles.badgeText}>{item.ai_urgency.toUpperCase()}</Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c', marginTop: 12, marginBottom: 16 },
  list: { gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5eaea',
    borderRadius: 12,
    padding: 14,
  },
  rowMain: { gap: 2 },
  rowDate: { fontSize: 15, fontWeight: '600', color: '#0f2a30' },
  rowMeta: { fontSize: 13, color: '#4a5a5f' },
  badge: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#8a9a9d', marginTop: 40 },
});

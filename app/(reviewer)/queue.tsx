import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type QueueRow = {
  id: string;
  captured_at: string;
  readings: Record<string, number>;
  ai_urgency: 'low' | 'medium' | 'high' | null;
  review_status: 'unreviewed' | 'validated' | 'rejected' | 'noted';
  sites: { name: string } | null;
};

const URGENCY_FILTERS = ['all', 'high', 'medium', 'low'] as const;
const STATUS_FILTERS = ['unreviewed', 'validated', 'rejected', 'noted', 'all'] as const;

const URGENCY_COLOR: Record<string, string> = { high: '#b3261e', medium: '#9a6b00', low: '#1e7a3c' };

export default function ReviewQueue() {
  const { data: membership } = useMembership();
  const [urgencyFilter, setUrgencyFilter] = useState<(typeof URGENCY_FILTERS)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('unreviewed');

  const { data: submissions } = useQuery({
    queryKey: ['review-queue', membership?.org_id, urgencyFilter, statusFilter],
    queryFn: async (): Promise<QueueRow[]> => {
      let query = supabase
        .from('submissions')
        .select('id, captured_at, readings, ai_urgency, review_status, sites(name)')
        .order('captured_at', { ascending: false });
      if (urgencyFilter !== 'all') query = query.eq('ai_urgency', urgencyFilter);
      if (statusFilter !== 'all') query = query.eq('review_status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as QueueRow[]) ?? [];
    },
    enabled: !!membership?.org_id,
  });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Review queue</Text>

      <View style={styles.filterRow}>
        {URGENCY_FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, urgencyFilter === f && styles.chipActive]}
            onPress={() => setUrgencyFilter(f)}
          >
            <Text style={[styles.chipText, urgencyFilter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All urgency' : f}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, statusFilter === f && styles.chipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>Nothing here</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/(reviewer)/${item.id}`)}>
            <View style={styles.rowMain}>
              <Text style={styles.rowDate}>
                {item.sites?.name ? `${item.sites.name} · ` : ''}
                {new Date(item.captured_at).toLocaleString()}
              </Text>
              <Text style={styles.rowMeta}>{item.review_status}</Text>
            </View>
            {item.ai_urgency && (
              <View style={[styles.badge, { backgroundColor: URGENCY_COLOR[item.ai_urgency] }]}>
                <Text style={styles.badgeText}>{item.ai_urgency.toUpperCase()}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c', marginTop: 12, marginBottom: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: '#c9d3d4', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#0f4c5c', borderColor: '#0f4c5c' },
  chipText: { fontSize: 13, color: '#0f4c5c', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  list: { gap: 10, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5eaea',
    borderRadius: 12,
    padding: 14,
  },
  rowMain: { gap: 2, flexShrink: 1 },
  rowDate: { fontSize: 15, fontWeight: '600', color: '#0f2a30' },
  rowMeta: { fontSize: 13, color: '#4a5a5f', textTransform: 'capitalize' },
  badge: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#8a9a9d', marginTop: 40 },
});

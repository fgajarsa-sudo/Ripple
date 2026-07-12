import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { ScreenTitle } from '../../components/ui';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { colors, fonts, radius } from '../../lib/theme';
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
    <View style={styles.root}>
      <AppHeader />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.titleRow}>
          <ScreenTitle>Review queue</ScreenTitle>
        </View>

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
              {item.ai_urgency && <UrgencyBadge urgency={item.ai_urgency} />}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  titleRow: { marginTop: 8, marginBottom: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontSize: 13, color: colors.teal, textTransform: 'capitalize', fontFamily: fonts.body },
  chipTextActive: { color: colors.tealForeground },
  list: { gap: 10, paddingVertical: 16 },
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
  rowMain: { gap: 2, flexShrink: 1 },
  rowDate: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  rowMeta: { fontSize: 13, color: colors.mutedForeground, textTransform: 'capitalize', fontFamily: fonts.body },
  emptyText: { textAlign: 'center', color: colors.mutedForeground, marginTop: 40, fontFamily: fonts.body },
});

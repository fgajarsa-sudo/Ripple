import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/SessionProvider';

type SubmissionRow = {
  id: string;
  captured_at: string;
  readings: Record<string, number>;
  ai_urgency: 'low' | 'medium' | 'high' | null;
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
    <View style={styles.root}>
      <AppHeader />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
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
                {item.ai_urgency && <UrgencyBadge urgency={item.ai_urgency} />}
              </View>
            );
          }}
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

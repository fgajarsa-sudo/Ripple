import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius } from '../../lib/theme';
import { SENSOR_PARAMETERS, type SensorParameterKey } from '../../lib/readings';
import { useSession } from '../../lib/SessionProvider';
import { supabase } from '../../lib/supabase';

type Threshold = { parameter: string; min_value: number | null; max_value: number | null; severity: string };
type SubmissionDetail = {
  id: string;
  org_id: string;
  captured_at: string;
  weather: string | null;
  notes: string | null;
  readings: Record<string, number>;
  photo_path: string | null;
  ai_urgency: 'low' | 'medium' | 'high' | null;
  ai_summary: string | null;
  ai_flags: { flags?: string[]; photo_observations?: string | null } | null;
  review_status: 'unreviewed' | 'validated' | 'rejected' | 'noted';
  reviewer_note: string | null;
  sites: { name: string } | null;
};

function violatedSeverity(value: number, thresholds: Threshold[], parameter: string): string | null {
  const high = thresholds.find((t) => t.parameter === parameter && t.severity === 'high');
  if (high && ((high.min_value !== null && value < high.min_value) || (high.max_value !== null && value > high.max_value))) {
    return 'high';
  }
  const medium = thresholds.find((t) => t.parameter === parameter && t.severity === 'medium');
  if (medium && ((medium.min_value !== null && value < medium.min_value) || (medium.max_value !== null && value > medium.max_value))) {
    return 'medium';
  }
  return null;
}

export default function SubmissionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission-detail', id],
    queryFn: async (): Promise<SubmissionDetail> => {
      const { data, error } = await supabase
        .from('submissions')
        .select(
          'id, org_id, captured_at, weather, notes, readings, photo_path, ai_urgency, ai_summary, ai_flags, review_status, reviewer_note, sites(name)'
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      const row = data as unknown as SubmissionDetail;
      if (row.photo_path) {
        const { data: signed } = await supabase.storage
          .from('submission-photos')
          .createSignedUrl(row.photo_path, 300);
        setPhotoUrl(signed?.signedUrl ?? null);
      }
      return row;
    },
    enabled: !!id,
  });

  const { data: thresholds } = useQuery({
    queryKey: ['thresholds', submission?.org_id],
    queryFn: async (): Promise<Threshold[]> => {
      const { data, error } = await supabase
        .from('thresholds')
        .select('parameter, min_value, max_value, severity')
        .eq('org_id', submission!.org_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!submission?.org_id,
  });

  const applyAction = async (status: 'validated' | 'rejected' | 'noted') => {
    if (!id || !session?.user.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          review_status: status,
          reviewed_by: session.user.id,
          reviewer_note: note || null,
        })
        .eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !submission) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.teal} />
      </SafeAreaView>
    );
  }

  const readingEntries = SENSOR_PARAMETERS.filter(
    (p) => submission.readings[p.key] !== undefined
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>← Back to queue</Text>
        </Pressable>

        <Text style={styles.title}>
          {submission.sites?.name ?? 'Unknown site'} ·{' '}
          {new Date(submission.captured_at).toLocaleString()}
        </Text>
        {submission.weather && <Text style={styles.meta}>Weather: {submission.weather}</Text>}

        {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photo} />}

        {submission.ai_summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI SUMMARY</Text>
            <Text style={styles.sectionBody}>{submission.ai_summary}</Text>
            {submission.ai_flags?.photo_observations && (
              <Text style={styles.sectionBody}>{submission.ai_flags.photo_observations}</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>READINGS VS THRESHOLDS</Text>
          {readingEntries.length === 0 ? (
            <Text style={styles.sectionBody}>No readings entered</Text>
          ) : (
            readingEntries.map((param) => {
              const value = submission.readings[param.key as SensorParameterKey];
              const violation = thresholds ? violatedSeverity(value, thresholds, param.key) : null;
              return (
                <View key={param.key} style={styles.readingRow}>
                  <Text style={styles.readingLabel}>{param.label}</Text>
                  <Text
                    style={[
                      styles.readingValue,
                      violation === 'high' && styles.readingHigh,
                      violation === 'medium' && styles.readingMedium,
                    ]}
                  >
                    {value} {param.unit}
                    {violation ? ` (${violation})` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTE</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note (optional)"
            multiline
            value={note}
            onChangeText={setNote}
          />
        </View>
      </ScrollView>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => applyAction('rejected')}
          disabled={isSaving}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.noteButton]}
          onPress={() => applyAction('noted')}
          disabled={isSaving}
        >
          <Text style={styles.noteButtonText}>Note only</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.validateButton]}
          onPress={() => applyAction('validated')}
          disabled={isSaving}
        >
          <Text style={styles.validateButtonText}>Validate</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 24, gap: 16 },
  backLink: { fontSize: 14, color: colors.teal, marginBottom: 4, fontFamily: fonts.body },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.navy },
  meta: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  photo: { width: '100%', height: 200, borderRadius: radius.md },
  section: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.mutedForeground, letterSpacing: 0.5 },
  sectionBody: { fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readingLabel: { fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
  readingValue: { fontSize: 15, color: colors.mutedForeground, fontFamily: fonts.body },
  readingHigh: { color: colors.destructive, fontFamily: fonts.bodySemiBold },
  readingMedium: { color: colors.warnForeground, fontFamily: fonts.bodySemiBold },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.foreground,
    backgroundColor: colors.card,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', gap: 8, padding: 24 },
  actionButton: { flex: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  rejectButton: { borderWidth: 1, borderColor: colors.destructive },
  rejectButtonText: { color: colors.destructive, fontFamily: fonts.bodySemiBold },
  noteButton: { borderWidth: 1, borderColor: colors.mutedForeground },
  noteButtonText: { color: colors.mutedForeground, fontFamily: fonts.bodySemiBold },
  validateButton: { backgroundColor: colors.teal },
  validateButtonText: { color: colors.tealForeground, fontFamily: fonts.bodySemiBold },
});

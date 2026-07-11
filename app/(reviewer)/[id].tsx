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
        <ActivityIndicator style={{ marginTop: 40 }} />
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
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 16 },
  backLink: { fontSize: 14, color: '#0f4c5c', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f2a30' },
  meta: { fontSize: 13, color: '#4a5a5f' },
  photo: { width: '100%', height: 200, borderRadius: 12 },
  section: { gap: 6, borderTopWidth: 1, borderTopColor: '#e5eaea', paddingTop: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#4a5a5f', letterSpacing: 0.5 },
  sectionBody: { fontSize: 15, color: '#0f2a30' },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readingLabel: { fontSize: 15, color: '#0f2a30' },
  readingValue: { fontSize: 15, color: '#4a5a5f' },
  readingHigh: { color: '#b3261e', fontWeight: '700' },
  readingMedium: { color: '#9a6b00', fontWeight: '600' },
  noteInput: {
    borderWidth: 1,
    borderColor: '#c9d3d4',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', gap: 8, padding: 24 },
  actionButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  rejectButton: { borderWidth: 1, borderColor: '#b3261e' },
  rejectButtonText: { color: '#b3261e', fontWeight: '600' },
  noteButton: { borderWidth: 1, borderColor: '#4a5a5f' },
  noteButtonText: { color: '#4a5a5f', fontWeight: '600' },
  validateButton: { backgroundColor: '#0f4c5c' },
  validateButtonText: { color: '#fff', fontWeight: '600' },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SENSOR_PARAMETERS } from '../../../lib/readings';
import { useSession } from '../../../lib/SessionProvider';
import { submitReading } from '../../../lib/submitReading';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';
import { useMembership } from '../../../lib/useMembership';

export default function ReviewStep() {
  const { draft } = useSubmitDraft();
  const { session } = useSession();
  const { data: membership } = useMembership();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const readingEntries = SENSOR_PARAMETERS.filter((p) => draft.readings[p.key] !== undefined);

  const onSubmit = async () => {
    if (!membership?.org_id || !session?.user.id) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await submitReading(draft, membership.org_id, session.user.id);
      router.replace({
        pathname: '/(member)/submit/submitted',
        params: { urgency: result.ai_urgency ?? '' },
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Review & submit</Text>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>LOCATION & TIME</Text>
            <Pressable onPress={() => router.push('/(member)/submit/location')}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionBody}>
            {draft.siteName ? `${draft.siteName} · ` : ''}
            {draft.lat?.toFixed(4)}°, {draft.lng?.toFixed(4)}°
          </Text>
          <Text style={styles.sectionBody}>
            {new Date(draft.capturedAt).toLocaleString()} · {draft.weather}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>PHOTO</Text>
            <Pressable onPress={() => router.push('/(member)/submit/photo')}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
          {draft.photoUri ? (
            <Image source={{ uri: draft.photoUri }} style={styles.photoPreview} />
          ) : (
            <Text style={styles.sectionBody}>No photo attached</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SENSOR DATA</Text>
            <Pressable onPress={() => router.push('/(member)/submit/data')}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
          {readingEntries.length === 0 ? (
            <Text style={styles.sectionBody}>No readings entered</Text>
          ) : (
            readingEntries.map((param) => (
              <View key={param.key} style={styles.readingRow}>
                <Text style={styles.readingLabel}>{param.label}</Text>
                <Text style={styles.readingValue}>
                  {draft.readings[param.key]} {param.unit}
                </Text>
              </View>
            ))
          )}
        </View>

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </ScrollView>

      <Pressable style={styles.submitButton} onPress={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Reading</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c' },
  section: { gap: 6, borderBottomWidth: 1, borderBottomColor: '#e5eaea', paddingBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#4a5a5f', letterSpacing: 0.5 },
  editLink: { fontSize: 13, color: '#0f4c5c', fontWeight: '600' },
  sectionBody: { fontSize: 15, color: '#0f2a30' },
  photoPreview: { width: '100%', height: 160, borderRadius: 12, marginTop: 4 },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readingLabel: { fontSize: 15, color: '#0f2a30' },
  readingValue: { fontSize: 15, color: '#4a5a5f' },
  errorText: { color: '#b3261e', fontSize: 14, textAlign: 'center' },
  submitButton: {
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    margin: 24,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

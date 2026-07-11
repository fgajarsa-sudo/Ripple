import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

const URGENCY_COPY: Record<string, { label: string; color: string; message: string }> = {
  high: {
    label: 'HIGH URGENCY',
    color: '#b3261e',
    message: 'This reading is flagged for review — your group’s reviewers will see it in their queue.',
  },
  medium: {
    label: 'MEDIUM URGENCY',
    color: '#9a6b00',
    message: 'A few readings are outside the usual range for this lake.',
  },
  low: {
    label: 'LOW URGENCY',
    color: '#1e7a3c',
    message: 'Readings look within the healthy baseline range.',
  },
};

export default function SubmittedStep() {
  const { urgency } = useLocalSearchParams<{ urgency?: string }>();
  const { resetDraft } = useSubmitDraft();
  const copy = urgency ? URGENCY_COPY[urgency] : null;

  useEffect(() => {
    // clear the draft now that it's been submitted, so a fresh Submit starts empty
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.checkmark}>✓</Text>
        <Text style={styles.title}>Reading submitted</Text>

        {copy && (
          <View style={[styles.badge, { backgroundColor: copy.color }]}>
            <Text style={styles.badgeText}>{copy.label}</Text>
          </View>
        )}
        {copy && <Text style={styles.message}>{copy.message}</Text>}
        {!copy && (
          <Text style={styles.message}>
            Thanks for your submission — your reading has been added to the group's records.
          </Text>
        )}
      </View>

      <Pressable style={styles.doneButton} onPress={() => router.replace('/(member)/home')}>
        <Text style={styles.doneButtonText}>Done</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'space-between', padding: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  checkmark: { fontSize: 48, color: '#1e7a3c' },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c' },
  badge: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  message: { fontSize: 15, color: '#4a5a5f', textAlign: 'center', paddingHorizontal: 16 },
  doneButton: { backgroundColor: '#0f4c5c', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

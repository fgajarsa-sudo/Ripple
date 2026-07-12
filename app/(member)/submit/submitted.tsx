import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { RippleCelebration } from '../../../components/RippleCelebration';
import { PillButton } from '../../../components/ui';
import { UrgencyBadge } from '../../../components/UrgencyBadge';
import { colors, fonts } from '../../../lib/theme';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

const URGENCY_MESSAGE: Record<string, string> = {
  high: 'This reading is flagged for review — your group’s reviewers will see it in their queue.',
  medium: 'A few readings are outside the usual range for this lake.',
  low: 'Readings look within the healthy baseline range.',
};

export default function SubmittedStep() {
  const { urgency } = useLocalSearchParams<{ urgency?: string }>();
  const { resetDraft } = useSubmitDraft();
  const validUrgency = urgency === 'low' || urgency === 'medium' || urgency === 'high' ? urgency : null;

  useEffect(() => {
    // clear the draft now that it's been submitted, so a fresh Submit starts empty
    resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <AppHeader />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.content}>
          <RippleCelebration />
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.title}>Reading submitted</Text>
          <Text style={styles.tagline}>Every reading makes a difference.</Text>

          {validUrgency && <UrgencyBadge urgency={validUrgency} />}
          <Text style={styles.message}>
            {validUrgency
              ? URGENCY_MESSAGE[validUrgency]
              : "Thanks for your submission — your reading has been added to the group's records."}
          </Text>
        </View>

        <PillButton title="Done" onPress={() => router.replace('/(member)/home')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, justifyContent: 'space-between', padding: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  checkmark: { fontSize: 48, color: colors.teal },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.navy },
  tagline: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.teal },
  message: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 16, fontFamily: fonts.body },
});

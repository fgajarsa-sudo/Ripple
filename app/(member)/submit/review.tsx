import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { ErrorText, PillButton, ScreenTitle } from '../../../components/ui';
import { colors, fonts, radius } from '../../../lib/theme';
import { SENSOR_PARAMETERS } from '../../../lib/readings';
import { useSession } from '../../../lib/SessionProvider';
import { submitReading } from '../../../lib/submitReading';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';
import { useMembership } from '../../../lib/useMembership';

export default function ReviewStep() {
  const { draft, resetDraft } = useSubmitDraft();
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

  const onCancel = () => {
    resetDraft();
    router.replace('/(member)/home');
  };

  return (
    <View style={styles.root}>
      <AppHeader
        right={
          <Pressable onPress={onCancel}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </Pressable>
        }
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Review & submit</ScreenTitle>

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

        {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
      </ScrollView>

      <View style={styles.submitButtonWrap}>
        <PillButton title="Submit Reading" onPress={onSubmit} loading={isSubmitting} />
      </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1 },
  cancelLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  content: { padding: 24, gap: 20 },
  section: { gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.mutedForeground, letterSpacing: 0.5 },
  editLink: { fontSize: 13, color: colors.teal, fontFamily: fonts.bodySemiBold },
  sectionBody: { fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
  photoPreview: { width: '100%', height: 160, borderRadius: radius.md, marginTop: 4 },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readingLabel: { fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
  readingValue: { fontSize: 15, color: colors.mutedForeground, fontFamily: fonts.body },
  submitButtonWrap: { margin: 24 },
});

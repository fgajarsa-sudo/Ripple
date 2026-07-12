import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { ErrorText, PillButton, ScreenTitle } from '../../components/ui';
import { SENSOR_PARAMETERS } from '../../lib/readings';
import { colors, fonts } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/SessionProvider';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function SettingsScreen() {
  const { session } = useSession();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onExport = async () => {
    setErrorMessage(null);
    setIsExporting(true);
    try {
      // RLS already scopes submissions to the caller's own rows (or their org staff role) —
      // no Edge Function needed here, unlike the admin-wide export which has to check role
      // across every member.
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('id, captured_at, weather, notes, readings, photo_path, ai_urgency, review_status, sites(name)')
        .order('captured_at', { ascending: false });
      if (error) throw error;

      const headerCols = [
        'id',
        'site',
        'captured_at',
        'weather',
        ...SENSOR_PARAMETERS.map((p) => p.key),
        'has_photo',
        'ai_urgency',
        'review_status',
        'notes',
      ];
      const lines = [headerCols.join(',')];

      for (const row of submissions ?? []) {
        const readings = (row.readings ?? {}) as Record<string, number>;
        const cols = [
          row.id,
          (row as any).sites?.name ?? '',
          row.captured_at,
          row.weather ?? '',
          ...SENSOR_PARAMETERS.map((p) => readings[p.key] ?? ''),
          row.photo_path ? 'yes' : 'no',
          row.ai_urgency ?? '',
          row.review_status,
          row.notes ?? '',
        ];
        lines.push(cols.map(csvEscape).join(','));
      }
      const csv = lines.join('\n');

      const file = new File(Paths.cache, `ripple-my-data-${Date.now()}.csv`);
      file.create();
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } else {
        Alert.alert('Export ready', `Saved to ${file.uri}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsExporting(false);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      "This permanently deletes your profile and login. Your group keeps the readings you've submitted, but they'll no longer be linked to your name. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: performDelete },
      ]
    );
  };

  const performDelete = async () => {
    if (!session?.access_token) return;
    setErrorMessage(null);
    setIsDeleting(true);
    try {
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Delete failed (${response.status})`);
      }
      // scope: 'local' only clears the on-device session — a server-side revoke would try
      // to look up a user that (by this point) no longer exists.
      await supabase.auth.signOut({ scope: 'local' });
      router.replace('/(auth)/welcome');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        right={
          <Pressable onPress={() => router.replace('/(member)/home')}>
            <Text style={styles.homeLink}>Home</Text>
          </Pressable>
        }
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenTitle>Settings</ScreenTitle>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY DATA</Text>
          <Text style={styles.hint}>Download a CSV of every reading you've personally submitted.</Text>
          <PillButton title="Export my data" variant="secondary" onPress={onExport} loading={isExporting} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <Text style={styles.hint}>
            Deletes your profile and login. Your group keeps the readings you've submitted, attributed to
            "former member" instead of your name.
          </Text>
          <PillButton
            title="Delete my account"
            variant="destructive"
            onPress={onDeleteAccount}
            loading={isDeleting}
          />
        </View>

        {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24, gap: 28 },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.mutedForeground, letterSpacing: 0.5 },
  hint: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body, lineHeight: 20 },
});

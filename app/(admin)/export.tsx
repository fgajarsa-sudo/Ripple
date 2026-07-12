import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

export default function ExportScreen() {
  const { data: membership } = useMembership();
  const [isExporting, setIsExporting] = useState(false);

  const onExport = async () => {
    if (!membership?.org_id) return;
    setIsExporting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-org-data?org_id=${membership.org_id}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Export failed (${response.status})`);
      }
      const csv = await response.text();

      const file = new File(Paths.cache, `ripple-export-${Date.now()}.csv`);
      file.create();
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } else {
        Alert.alert('Export ready', `Saved to ${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsExporting(false);
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
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>← Admin menu</Text>
        </Pressable>
        <ScreenTitle>Export group data</ScreenTitle>
        <Text style={styles.hint}>
          Downloads a CSV of every submission in your group, including exact GPS coordinates and who
          submitted each reading. This data belongs to your group — Ripple's own aggregate view never
          includes any of this.
        </Text>

        <View style={styles.buttonSpacing}>
          <PillButton title="Export CSV" onPress={onExport} loading={isExporting} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  backLink: { fontSize: 14, color: colors.teal, marginTop: 8, marginBottom: 4, fontFamily: fonts.body },
  hint: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body, marginTop: 12, marginBottom: 20, lineHeight: 20 },
  buttonSpacing: { marginTop: 8 },
});

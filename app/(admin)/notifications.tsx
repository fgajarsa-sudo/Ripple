import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type Site = { id: string; name: string };
type Target = 'all' | 'active_30d' | 'site';

const TARGET_LABELS: Record<Target, string> = {
  all: 'All members',
  active_30d: 'Active (last 30 days)',
  site: 'Site',
};

// Mirrors resolveTargetUserIds() in the send-notification Edge Function — used here only
// to preview a recipient count client-side before actually sending, via the admin's own
// RLS-scoped read access (no service role available on the client, nor needed for reads).
async function previewRecipientCount(orgId: string, target: Target, siteId: string | null): Promise<number> {
  if (target === 'all') {
    const { count } = await supabase
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active');
    return count ?? 0;
  }
  if (target === 'active_30d') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('submissions').select('user_id').eq('org_id', orgId).gte('created_at', since);
    return new Set((data ?? []).map((r) => r.user_id)).size;
  }
  if (target === 'site' && siteId) {
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: submitters }, { data: subscribers }] = await Promise.all([
      supabase.from('submissions').select('user_id').eq('org_id', orgId).eq('site_id', siteId).gte('created_at', since90),
      supabase.from('site_subscriptions').select('user_id').eq('site_id', siteId),
    ]);
    return new Set([...(submitters ?? []).map((r) => r.user_id), ...(subscribers ?? []).map((r) => r.user_id)]).size;
  }
  return 0;
}

export default function NotificationComposerScreen() {
  const { data: membership } = useMembership();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ['sites-for-notify', membership?.org_id],
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await supabase.from('sites').select('id, name').eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!membership?.org_id,
  });

  useEffect(() => {
    if (!membership?.org_id) return;
    if (target === 'site' && !siteId) {
      setRecipientCount(null);
      return;
    }
    previewRecipientCount(membership.org_id, target, siteId).then(setRecipientCount);
  }, [membership?.org_id, target, siteId]);

  const onSend = async () => {
    if (!membership?.org_id || !title.trim() || !body.trim()) {
      Alert.alert('Missing info', 'Title and body are required.');
      return;
    }
    if (target === 'site' && !siteId) {
      Alert.alert('Pick a site', 'Choose which site to target.');
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: { org_id: membership.org_id, title: title.trim(), body: body.trim(), target, target_site_id: siteId },
      });
      if (error) throw error;
      Alert.alert('Sent', `Delivered to ${data?.recipientCount ?? 0} recipient(s).`);
      setTitle('');
      setBody('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSending(false);
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
        <ScreenTitle>Send notification</ScreenTitle>

        <ScrollView contentContainerStyle={styles.form}>
          <Input placeholder="Title" value={title} onChangeText={setTitle} />
          <Input placeholder="Message" value={body} onChangeText={setBody} multiline style={styles.bodyInput} />

          <Text style={styles.sectionTitle}>TARGET</Text>
          <View style={styles.targetRow}>
            {(Object.keys(TARGET_LABELS) as Target[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.targetChip, target === t && styles.targetChipActive]}
                onPress={() => {
                  setTarget(t);
                  if (t !== 'site') setSiteId(null);
                }}
              >
                <Text style={[styles.targetChipText, target === t && styles.targetChipTextActive]}>
                  {TARGET_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          {target === 'site' && (
            <View style={styles.targetRow}>
              {(sites ?? []).map((site) => (
                <Pressable
                  key={site.id}
                  style={[styles.targetChip, siteId === site.id && styles.targetChipActive]}
                  onPress={() => setSiteId(site.id)}
                >
                  <Text style={[styles.targetChipText, siteId === site.id && styles.targetChipTextActive]}>
                    {site.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.recipientPreview}>
            {recipientCount === null ? 'Choose a target to see recipient count' : `${recipientCount} recipient(s)`}
          </Text>

          <PillButton title="Send" onPress={onSend} loading={isSending} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  backLink: { fontSize: 14, color: colors.teal, marginTop: 8, marginBottom: 4, fontFamily: fonts.body },
  form: { gap: 12, paddingTop: 12, paddingBottom: 32 },
  bodyInput: { minHeight: 90, textAlignVertical: 'top' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.mutedForeground,
    letterSpacing: 1,
    marginTop: 8,
  },
  targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targetChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  targetChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  targetChipText: { fontSize: 13, color: colors.teal, fontFamily: fonts.body },
  targetChipTextActive: { color: colors.tealForeground },
  recipientPreview: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body, marginVertical: 4 },
});

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts } from '../../lib/theme';
import { SENSOR_PARAMETERS, type SensorParameterKey } from '../../lib/readings';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type ThresholdRow = {
  parameter: SensorParameterKey;
  min_value: number | null;
  max_value: number | null;
  severity: 'medium' | 'high';
};

// { [parameter]: { medium: {min, max}, high: {min, max} } }
type DraftState = Record<string, Record<'medium' | 'high', { min: string; max: string }>>;

function toDraft(rows: ThresholdRow[]): DraftState {
  const draft: DraftState = {};
  for (const row of rows) {
    draft[row.parameter] ??= {
      medium: { min: '', max: '' },
      high: { min: '', max: '' },
    };
    draft[row.parameter][row.severity] = {
      min: row.min_value !== null ? String(row.min_value) : '',
      max: row.max_value !== null ? String(row.max_value) : '',
    };
  }
  return draft;
}

export default function ThresholdsScreen() {
  const { data: membership } = useMembership();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const { data: thresholds, isLoading } = useQuery({
    queryKey: ['thresholds-admin', membership?.org_id],
    queryFn: async (): Promise<ThresholdRow[]> => {
      const { data, error } = await supabase
        .from('thresholds')
        .select('parameter, min_value, max_value, severity')
        .eq('org_id', membership!.org_id);
      if (error) throw error;
      return data as ThresholdRow[];
    },
    enabled: !!membership?.org_id,
  });

  useEffect(() => {
    if (thresholds) setDraft(toDraft(thresholds));
  }, [thresholds]);

  const updateField = (parameter: string, severity: 'medium' | 'high', field: 'min' | 'max', value: string) => {
    setDraft((prev) => ({
      ...prev,
      [parameter]: {
        ...prev[parameter],
        [severity]: { ...prev[parameter]?.[severity], [field]: value },
      },
    }));
  };

  const onSave = async () => {
    if (!membership?.org_id) return;
    setIsSaving(true);
    try {
      const rows = SENSOR_PARAMETERS.flatMap((param) =>
        (['medium', 'high'] as const).map((severity) => {
          const entry = draft[param.key]?.[severity] ?? { min: '', max: '' };
          return {
            org_id: membership.org_id,
            parameter: param.key,
            severity,
            min_value: entry.min === '' ? null : Number(entry.min),
            max_value: entry.max === '' ? null : Number(entry.max),
          };
        })
      );
      const { error } = await supabase
        .from('thresholds')
        .upsert(rows, { onConflict: 'org_id,parameter,severity' });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['thresholds-admin'] });
      Alert.alert('Saved', 'Thresholds updated. This only affects future submissions.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  const onReset = async () => {
    if (!membership?.org_id) return;
    setIsResetting(true);
    try {
      const { error } = await supabase.rpc('reset_org_thresholds', { target_org_id: membership.org_id });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['thresholds-admin'] });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsResetting(false);
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
        <ScreenTitle>Thresholds</ScreenTitle>
        <Text style={styles.hint}>
          Values outside these ranges drive automatic urgency scoring. Changes only apply to future
          submissions — past readings are never rescored.
        </Text>

        {isLoading ? (
          <Text style={styles.hint}>Loading…</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {SENSOR_PARAMETERS.map((param) => (
              <View key={param.key} style={styles.card}>
                <Text style={styles.paramLabel}>
                  {param.label} {param.unit ? `(${param.unit})` : ''}
                </Text>
                {(['medium', 'high'] as const).map((severity) => (
                  <View key={severity} style={styles.severityRow}>
                    <Text style={styles.severityLabel}>{severity}</Text>
                    <Input
                      style={styles.numberInput}
                      placeholder="min"
                      keyboardType="numbers-and-punctuation"
                      value={draft[param.key]?.[severity]?.min ?? ''}
                      onChangeText={(t) => updateField(param.key, severity, 'min', t)}
                    />
                    <Text style={styles.toText}>to</Text>
                    <Input
                      style={styles.numberInput}
                      placeholder="max"
                      keyboardType="numbers-and-punctuation"
                      value={draft[param.key]?.[severity]?.max ?? ''}
                      onChangeText={(t) => updateField(param.key, severity, 'max', t)}
                    />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.actions}>
          <View style={styles.actionFlex}>
            <PillButton title="Reset to defaults" variant="secondary" onPress={onReset} loading={isResetting} />
          </View>
          <View style={styles.actionFlex}>
            <PillButton title="Save changes" onPress={onSave} loading={isSaving} />
          </View>
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
  hint: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, marginTop: 6, marginBottom: 16 },
  list: { gap: 16, paddingBottom: 16 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.card, gap: 8 },
  paramLabel: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  severityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  severityLabel: { width: 60, fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, textTransform: 'capitalize' },
  numberInput: { flex: 1, paddingVertical: 8 },
  toText: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionFlex: { flex: 1 },
});

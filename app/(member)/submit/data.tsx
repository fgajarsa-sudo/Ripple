import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { Input, PillButton, ScreenTitle } from '../../../components/ui';
import { colors, fonts } from '../../../lib/theme';
import { isPlausible } from '../../../lib/plausibleRanges';
import { roundToParameterPrecision, SENSOR_PARAMETERS, type SensorParameterKey } from '../../../lib/readings';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

export default function DataStep() {
  const { draft, updateDraft, resetDraft } = useSubmitDraft();

  const onChangeValue = (key: SensorParameterKey, text: string) => {
    const trimmed = text.trim();
    const next = { ...draft.readings };
    if (trimmed === '') {
      delete next[key];
    } else {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        next[key] = roundToParameterPrecision(key, num);
      }
    }
    updateDraft({ readings: next });
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
          <ScreenTitle>Sensor readings</ScreenTitle>
          <Text style={styles.hint}>All fields optional. Enter what you have.</Text>

          {SENSOR_PARAMETERS.map((param) => {
            const value = draft.readings[param.key];
            const showWarning = value !== undefined && !isPlausible(param.key, value);
            return (
              <View key={param.key} style={styles.field}>
                <View style={styles.fieldHeader}>
                  <Text style={styles.fieldLabel}>{param.label}</Text>
                  {param.unit ? <Text style={styles.fieldUnit}>{param.unit}</Text> : null}
                </View>
                <Input
                  keyboardType="numbers-and-punctuation"
                  value={value !== undefined ? String(value) : ''}
                  onChangeText={(t) => onChangeValue(param.key, t)}
                  placeholder={param.hint}
                />
                <Text style={styles.fieldHint}>{param.hint}</Text>
                {showWarning && (
                  <Text style={styles.warning}>That looks outside the usual range — double check it.</Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.nextButtonWrap}>
          <PillButton title="Next" onPress={() => router.push('/(member)/submit/review')} />
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
  hint: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  field: { gap: 4 },
  fieldHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  fieldLabel: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  fieldUnit: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  fieldHint: { fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body },
  warning: { fontSize: 12, color: colors.warnForeground, fontFamily: fonts.body },
  nextButtonWrap: { margin: 24 },
});

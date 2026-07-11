import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isPlausible } from '../../../lib/plausibleRanges';
import { SENSOR_PARAMETERS, type SensorParameterKey } from '../../../lib/readings';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

export default function DataStep() {
  const { draft, updateDraft } = useSubmitDraft();

  const onChangeValue = (key: SensorParameterKey, text: string) => {
    const trimmed = text.trim();
    const next = { ...draft.readings };
    if (trimmed === '') {
      delete next[key];
    } else {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        next[key] = num;
      }
    }
    updateDraft({ readings: next });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sensor readings</Text>
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
              <TextInput
                style={styles.input}
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

      <Pressable style={styles.nextButton} onPress={() => router.push('/(member)/submit/review')}>
        <Text style={styles.nextButtonText}>Next</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c' },
  hint: { fontSize: 14, color: '#4a5a5f' },
  field: { gap: 4 },
  fieldHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  fieldLabel: { fontSize: 16, fontWeight: '600', color: '#0f2a30' },
  fieldUnit: { fontSize: 13, color: '#4a5a5f' },
  input: {
    borderWidth: 1,
    borderColor: '#c9d3d4',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  fieldHint: { fontSize: 12, color: '#8a9a9d' },
  warning: { fontSize: 12, color: '#9a6b00' },
  nextButton: {
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    margin: 24,
  },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

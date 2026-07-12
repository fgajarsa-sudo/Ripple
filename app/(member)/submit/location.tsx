import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { Input, PillButton, ScreenTitle } from '../../../components/ui';
import { colors, fonts, radius } from '../../../lib/theme';
import { distanceMeters } from '../../../lib/geo';
import { supabase } from '../../../lib/supabase';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';
import { useMembership } from '../../../lib/useMembership';

const WEATHER_OPTIONS = ['Clear', 'Partly Cloudy', 'Overcast', 'Raining', 'Stormy', 'Foggy'];

type Site = { id: string; name: string; lat: number; lng: number; radius_m: number };

export default function LocationStep() {
  const { draft, updateDraft, resetDraft } = useSubmitDraft();
  const { data: membership } = useMembership();
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites', membership?.org_id],
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, lat, lng, radius_m')
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!membership?.org_id,
  });

  useEffect(() => {
    if (draft.lat !== null && draft.lng !== null) {
      setLocating(false);
      return;
    }
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is required to record where this reading was taken.');
        setLocating(false);
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({});
        updateDraft({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {
        setLocationError('Could not determine your location. You can enter it manually below.');
      } finally {
        setLocating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-match the nearest site whenever the coordinates or site list settle, unless the
  // member has already picked one manually this session.
  useEffect(() => {
    if (draft.siteId || draft.lat === null || draft.lng === null || !sites) return;
    let nearest: Site | null = null;
    let nearestDistance = Infinity;
    for (const site of sites) {
      const d = distanceMeters(draft.lat, draft.lng, site.lat, site.lng);
      if (d <= site.radius_m && d < nearestDistance) {
        nearest = site;
        nearestDistance = d;
      }
    }
    if (nearest) {
      updateDraft({ siteId: nearest.id, siteName: nearest.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lat, draft.lng, sites]);

  const canProceed = draft.lat !== null && draft.lng !== null && !!draft.weather;

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
        <ScreenTitle>Where are you?</ScreenTitle>

        {locating ? (
          <ActivityIndicator style={styles.locatingIndicator} color={colors.teal} />
        ) : (
          <View style={styles.locationCard}>
            <Text style={styles.locationLabel}>
              {draft.lat !== null ? 'GPS CONFIRMED' : 'ENTER LOCATION MANUALLY'}
            </Text>
            {locationError && <Text style={styles.warning}>{locationError}</Text>}
            <View style={styles.coordRow}>
              <Input
                style={styles.coordInput}
                placeholder="Latitude"
                keyboardType="numbers-and-punctuation"
                value={draft.lat !== null ? String(draft.lat) : ''}
                onChangeText={(t) => updateDraft({ lat: t ? Number(t) : null, siteId: null, siteName: null })}
              />
              <Input
                style={styles.coordInput}
                placeholder="Longitude"
                keyboardType="numbers-and-punctuation"
                value={draft.lng !== null ? String(draft.lng) : ''}
                onChangeText={(t) => updateDraft({ lng: t ? Number(t) : null, siteId: null, siteName: null })}
              />
            </View>
            {draft.siteName && <Text style={styles.siteMatch}>Site: {draft.siteName} ✓</Text>}
            {sites && sites.length > 0 && (
              <View style={styles.siteList}>
                {sites.map((site) => (
                  <Pressable
                    key={site.id}
                    style={[styles.siteChip, draft.siteId === site.id && styles.siteChipActive]}
                    onPress={() => updateDraft({ siteId: site.id, siteName: site.name })}
                  >
                    <Text
                      style={[
                        styles.siteChipText,
                        draft.siteId === site.id && styles.siteChipTextActive,
                      ]}
                    >
                      {site.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>DATE & TIME</Text>
        <Text style={styles.dateText}>{new Date(draft.capturedAt).toLocaleString()}</Text>

        <Text style={styles.sectionLabel}>WEATHER CONDITIONS</Text>
        <View style={styles.weatherRow}>
          {WEATHER_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.weatherChip, draft.weather === option && styles.weatherChipActive]}
              onPress={() => updateDraft({ weather: option })}
            >
              <Text
                style={[
                  styles.weatherChipText,
                  draft.weather === option && styles.weatherChipTextActive,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.nextButtonWrap}>
        <PillButton title="Next" onPress={() => router.push('/(member)/submit/photo')} disabled={!canProceed} />
      </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1 },
  cancelLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  content: { padding: 24, gap: 16 },
  locatingIndicator: { marginTop: 24 },
  locationCard: { gap: 10 },
  locationLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.mutedForeground, letterSpacing: 0.5 },
  warning: { color: colors.destructive, fontSize: 13, fontFamily: fonts.body },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordInput: { flex: 1 },
  siteMatch: { fontSize: 15, color: colors.teal, fontFamily: fonts.bodySemiBold },
  siteList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  siteChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  siteChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  siteChipText: { color: colors.teal, fontSize: 13, fontFamily: fonts.body },
  siteChipTextActive: { color: colors.tealForeground },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  dateText: { fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weatherChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  weatherChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  weatherChipText: { color: colors.teal, fontSize: 14, fontFamily: fonts.body },
  weatherChipTextActive: { color: colors.tealForeground },
  nextButtonWrap: { margin: 24 },
});

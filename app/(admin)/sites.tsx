import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/useMembership';

type Site = { id: string; name: string; lat: number; lng: number; radius_m: number; is_active: boolean };

function SiteRow({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [lat, setLat] = useState(String(site.lat));
  const [lng, setLng] = useState(String(site.lng));
  const [radiusM, setRadiusM] = useState(String(site.radius_m));
  const [isSaving, setIsSaving] = useState(false);

  const onSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sites')
        .update({ name, lat: Number(lat), lng: Number(lng), radius_m: Number(radiusM) })
        .eq('id', site.id);
      if (error) throw error;
      setEditing(false);
      onChanged();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  const onToggleActive = async (value: boolean) => {
    const { error } = await supabase.from('sites').update({ is_active: value }).eq('id', site.id);
    if (error) Alert.alert('Error', error.message);
    else onChanged();
  };

  const onDelete = () => {
    Alert.alert('Delete site?', `"${site.name}" will be removed. Past submissions keep their data.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('sites').delete().eq('id', site.id);
          if (error) Alert.alert('Error', error.message);
          else onChanged();
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={styles.card}>
        <Input value={name} onChangeText={setName} placeholder="Site name" />
        <View style={styles.coordRow}>
          <Input style={styles.coordInput} value={lat} onChangeText={setLat} placeholder="Latitude" keyboardType="numbers-and-punctuation" />
          <Input style={styles.coordInput} value={lng} onChangeText={setLng} placeholder="Longitude" keyboardType="numbers-and-punctuation" />
        </View>
        <Input value={radiusM} onChangeText={setRadiusM} placeholder="Radius (meters)" keyboardType="number-pad" />
        <View style={styles.editActions}>
          <Pressable onPress={() => setEditing(false)}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </Pressable>
          <View style={styles.saveButtonFlex}>
            <PillButton title="Save" onPress={onSave} loading={isSaving} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.siteName}>{site.name}</Text>
        <Switch value={site.is_active} onValueChange={onToggleActive} trackColor={{ true: colors.teal }} />
      </View>
      <Text style={styles.siteMeta}>
        {site.lat.toFixed(4)}°, {site.lng.toFixed(4)}° · {site.radius_m}m radius
      </Text>
      <View style={styles.rowActions}>
        <Pressable onPress={() => setEditing(true)}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={styles.deleteLink}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SitesScreen() {
  const { data: membership } = useMembership();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [newRadius, setNewRadius] = useState('500');
  const [isAdding, setIsAdding] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ['sites-admin', membership?.org_id],
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, lat, lng, radius_m, is_active')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!membership?.org_id,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['sites-admin'] });

  const onAdd = async () => {
    if (!membership?.org_id || !newName.trim() || !newLat || !newLng) {
      Alert.alert('Missing info', 'Name, latitude, and longitude are required.');
      return;
    }
    setIsAdding(true);
    try {
      const { error } = await supabase.from('sites').insert({
        org_id: membership.org_id,
        name: newName.trim(),
        lat: Number(newLat),
        lng: Number(newLng),
        radius_m: Number(newRadius) || 500,
      });
      if (error) throw error;
      setNewName('');
      setNewLat('');
      setNewLng('');
      setNewRadius('500');
      refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsAdding(false);
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
        <ScreenTitle>Sites</ScreenTitle>

        <FlatList
          data={sites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.hint}>No sites yet — add one below.</Text>}
          renderItem={({ item }) => <SiteRow site={item} onChanged={refetch} />}
          ListFooterComponent={
            <View style={[styles.card, styles.addCard]}>
              <Text style={styles.siteName}>Add a site</Text>
              <Input value={newName} onChangeText={setNewName} placeholder="Site name" />
              <View style={styles.coordRow}>
                <Input
                  style={styles.coordInput}
                  value={newLat}
                  onChangeText={setNewLat}
                  placeholder="Latitude"
                  keyboardType="numbers-and-punctuation"
                />
                <Input
                  style={styles.coordInput}
                  value={newLng}
                  onChangeText={setNewLng}
                  placeholder="Longitude"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <Input value={newRadius} onChangeText={setNewRadius} placeholder="Radius (meters)" keyboardType="number-pad" />
              <PillButton title="Add site" onPress={onAdd} loading={isAdding} />
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  backLink: { fontSize: 14, color: colors.teal, marginTop: 8, marginBottom: 4, fontFamily: fonts.body },
  hint: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, textAlign: 'center', marginTop: 24 },
  list: { gap: 12, paddingTop: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, backgroundColor: colors.card, gap: 8 },
  addCard: { marginTop: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  siteName: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  siteMeta: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  rowActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  editLink: { fontSize: 13, color: colors.teal, fontFamily: fonts.bodySemiBold },
  deleteLink: { fontSize: 13, color: colors.destructive, fontFamily: fonts.bodySemiBold },
  coordRow: { flexDirection: 'row', gap: 8 },
  coordInput: { flex: 1 },
  editActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  cancelLink: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  saveButtonFlex: { flex: 1 },
});

import { Fraunces_600SemiBold, useFonts as useFrauncesFonts } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold, useFonts as useInterFonts } from '@expo-google-fonts/inter';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { consumeFatalErrorLog } from '../lib/crashLog';
import { asyncStoragePersister, queryClient } from '../lib/queryClient';
// Sentry removed entirely (fresh-install crashes persisted even after removal — see
// `lib/crashLog.ts` for the on-device capture that replaced it as the way to see a fatal
// error that happens too early/natively for Sentry or a JS error boundary to catch).
import { SessionProvider } from '../lib/SessionProvider';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_600SemiBold });
  const [frauncesLoaded] = useFrauncesFonts({ Fraunces_600SemiBold });
  const [lastCrash, setLastCrash] = useState<string | null>(null);

  useEffect(() => {
    const crash = consumeFatalErrorLog();
    if (crash) {
      setLastCrash(crash);
      Alert.alert('Previous launch crashed', crash.slice(0, 500));
    }
  }, []);

  if (lastCrash) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.cream, paddingTop: 60, paddingHorizontal: 16 }}>
        <Text style={{ fontWeight: '600', marginBottom: 12 }}>Previous launch crashed with:</Text>
        <ScrollView style={{ flex: 1 }}>
          <Text selectable style={{ fontFamily: 'Courier', fontSize: 12 }}>
            {lastCrash}
          </Text>
        </ScrollView>
        <Pressable onPress={() => setLastCrash(null)} style={{ paddingVertical: 16 }}>
          <Text style={{ color: colors.teal, fontWeight: '600' }}>Continue to app</Text>
        </Pressable>
      </View>
    );
  }

  if (!interLoaded || !frauncesLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </SessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

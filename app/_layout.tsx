import { Fraunces_600SemiBold, useFonts as useFrauncesFonts } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold, useFonts as useInterFonts } from '@expo-google-fonts/inter';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { asyncStoragePersister, queryClient } from '../lib/queryClient';
// Sentry.wrap() + its native Session Replay "Unmask" view component disabled — a fresh-install
// crash log (expo.controller.errorRecoveryQueue, an uncaught exception at launch) showed
// RNSentryReplayUnmask* symbols in a live thread's register state, pointing at Sentry's native
// component registration as the likely cause. Pulled out entirely rather than keep guessing
// under time pressure — a working app now matters more than crash reporting. Revisit by
// upgrading @sentry/react-native or explicitly disabling Session Replay once there's room to
// debug this properly instead of under a deadline.
import { SessionProvider } from '../lib/SessionProvider';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_600SemiBold });
  const [frauncesLoaded] = useFrauncesFonts({ Fraunces_600SemiBold });

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

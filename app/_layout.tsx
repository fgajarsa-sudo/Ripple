import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { asyncStoragePersister, queryClient } from '../lib/queryClient';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

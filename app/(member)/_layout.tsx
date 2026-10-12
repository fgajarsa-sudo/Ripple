import { Redirect, Tabs } from 'expo-router';
import { History, House } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { registerPushToken } from '../../lib/registerPushToken';
import { useSession } from '../../lib/SessionProvider';
import { SubmitDraftProvider } from '../../lib/SubmitDraftContext';
import { startSyncListeners } from '../../lib/syncEngine';
import { colors, fonts } from '../../lib/theme';
import { useMembership } from '../../lib/useMembership';

export default function MemberLayout() {
  const { session, isLoading: sessionLoading } = useSession();
  const { data: membership, isLoading: membershipLoading } = useMembership();

  useEffect(() => {
    if (!session?.user.id) return;
    // Delayed well past expo-updates' ~10s post-first-render error-recovery window: if this
    // native call (APNs token registration) is ever the source of a fatal error, we want it
    // to happen after content has already appeared, so a fresh install can't get bricked by
    // error-recovery re-throwing it with nothing to roll back to. See lib/crashLog.ts.
    const timer = setTimeout(() => void registerPushToken(session.user.id), 15000);
    return () => clearTimeout(timer);
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    // Syncs immediately on mount (covers app-open-while-online) and again whenever
    // connectivity is regained — the whole point of a local queue is that submissions
    // made offline shouldn't need the user to remember to come back and retry.
    return startSyncListeners(session.user.id);
  }, [session?.user.id]);

  if (sessionLoading || (session && membershipLoading)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cream,
        }}
      >
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }
  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (!membership) {
    return <Redirect href="/(auth)/join-group" />;
  }

  // SubmitDraftProvider wraps the whole signed-in area, not just submit/: Home sets
  // draft.orgId (group vs independent collection) *before* the submit flow starts, so the
  // draft must exist above Home. When it only lived in submit/_layout.tsx, Home's
  // useSubmitDraft() threw on every render -> fatal JS error at launch/sign-in -> native
  // SIGABRT via expo-updates' error recovery. Keep exactly one provider (don't re-add one in
  // submit/_layout.tsx, or it would shadow this one and drop the org Home chose).
  return (
    <SubmitDraftProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.teal,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'My History',
            tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
          }}
        />
        <Tabs.Screen name="submit" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </SubmitDraftProvider>
  );
}

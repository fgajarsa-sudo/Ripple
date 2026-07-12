import { Redirect, Tabs } from 'expo-router';
import { History, House } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { registerPushToken } from '../../lib/registerPushToken';
import { useSession } from '../../lib/SessionProvider';
import { colors, fonts } from '../../lib/theme';
import { useMembership } from '../../lib/useMembership';

export default function MemberLayout() {
  const { session, isLoading: sessionLoading } = useSession();
  const { data: membership, isLoading: membershipLoading } = useMembership();

  useEffect(() => {
    if (session?.user.id) {
      void registerPushToken(session.user.id);
    }
  }, [session?.user.id]);

  if (sessionLoading || (session && membershipLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'My History', tabBarIcon: ({ color, size }) => <History color={color} size={size} /> }}
      />
      <Tabs.Screen name="submit" options={{ href: null }} />
    </Tabs>
  );
}

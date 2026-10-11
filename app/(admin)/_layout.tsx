import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AdminOrgProvider } from '../../lib/AdminOrgContext';
import { useSession } from '../../lib/SessionProvider';
import { colors } from '../../lib/theme';
import { useMemberships } from '../../lib/useMemberships';

export default function AdminLayout() {
  const { session, isLoading: sessionLoading } = useSession();
  const { data: memberships, isLoading: membershipsLoading } = useMemberships();
  // Optional: links into the admin section (the switcher on the admin menu, or the
  // post-creation "set thresholds" redirect) can target a specific org via ?orgId=. Falls
  // back to the same "prefer the real group" default useMembership() uses when omitted.
  const { orgId: requestedOrgId } = useLocalSearchParams<{ orgId?: string }>();

  if (sessionLoading || (session && membershipsLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }
  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (!memberships || memberships.length === 0) {
    return <Redirect href="/(auth)/join-group" />;
  }

  const active =
    (requestedOrgId ? memberships.find((m) => m.org_id === requestedOrgId) : undefined) ??
    memberships.find((m) => !m.organizations?.is_personal) ??
    memberships[0];

  if (active.role !== 'admin') {
    return <Redirect href="/(member)/home" />;
  }

  return (
    <AdminOrgProvider
      value={{
        orgId: active.org_id,
        orgName: active.organizations?.name ?? '',
        isPersonal: active.organizations?.is_personal ?? false,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </AdminOrgProvider>
  );
}

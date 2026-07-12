import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '../../lib/SessionProvider';
import { colors } from '../../lib/theme';
import { useMembership } from '../../lib/useMembership';

export default function ReviewerLayout() {
  const { session, isLoading: sessionLoading } = useSession();
  const { data: membership, isLoading: membershipLoading } = useMembership();

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
  if (membership.role !== 'reviewer' && membership.role !== 'admin') {
    return <Redirect href="/(member)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

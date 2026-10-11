import { router } from 'expo-router';
import { ArrowLeftRight, Bell, Download, MapPin, Sliders, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { ScreenTitle } from '../../components/ui';
import { useAdminOrg } from '../../lib/AdminOrgContext';
import { colors, fonts, radius } from '../../lib/theme';
import { useMemberships } from '../../lib/useMemberships';

const MENU_ITEMS = [
  { href: '/(admin)/thresholds', label: 'Thresholds', hint: 'Urgency scoring ranges per parameter', Icon: Sliders },
  { href: '/(admin)/sites', label: 'Sites', hint: 'Named monitoring locations', Icon: MapPin },
  { href: '/(admin)/members', label: 'Members & invites', hint: 'Roles, invite codes, QR codes', Icon: Users },
  { href: '/(admin)/notifications', label: 'Send notification', hint: 'Compose and target a push alert', Icon: Bell },
  { href: '/(admin)/export', label: 'Export group data', hint: 'Download a CSV of all submissions', Icon: Download },
] as const;

export default function AdminMenu() {
  const { orgId, orgName } = useAdminOrg();
  const { data: memberships } = useMemberships();

  // Nothing in expo-router carries search params between sibling pushes automatically, so
  // every link forwards the org id explicitly — otherwise navigating from here to Thresholds
  // (etc.) would silently reset back to the default (primary) org even if the admin switched
  // to their other org's menu first.
  const goTo = (href: (typeof MENU_ITEMS)[number]['href']) => {
    router.push({ pathname: href, params: { orgId } });
  };

  const otherAdminOrg = memberships?.find((m) => m.org_id !== orgId && m.role === 'admin');

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
        <View style={styles.titleRow}>
          <ScreenTitle>Admin</ScreenTitle>
          <Text style={styles.orgName}>{orgName}</Text>
        </View>

        {otherAdminOrg && (
          <Pressable
            style={styles.switchRow}
            onPress={() => router.replace({ pathname: '/(admin)', params: { orgId: otherAdminOrg.org_id } })}
          >
            <ArrowLeftRight color={colors.teal} size={18} />
            <Text style={styles.switchText}>
              Switch to {otherAdminOrg.organizations?.name ?? 'your other group'}
            </Text>
          </Pressable>
        )}

        <View style={styles.list}>
          {MENU_ITEMS.map(({ href, label, hint, Icon }) => (
            <Pressable key={href} style={styles.row} onPress={() => goTo(href)}>
              <View style={styles.iconBadge}>
                <Icon color={colors.teal} size={20} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowHint}>{hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24 },
  titleRow: { marginTop: 8, marginBottom: 20, gap: 2 },
  orgName: { fontSize: 14, color: colors.teal, fontFamily: fonts.bodySemiBold },
  homeLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 16,
  },
  switchText: { fontSize: 14, color: colors.teal, fontFamily: fonts.bodySemiBold },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.card,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.foreground },
  rowHint: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, marginTop: 2 },
});

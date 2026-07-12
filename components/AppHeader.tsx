import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../lib/theme';
import { Logo } from './Logo';

export function AppHeader({ right }: { right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Logo />
      <Text style={styles.wordmark}>ripple</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.cream,
  },
  right: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});

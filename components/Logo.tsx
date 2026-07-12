import { Waves } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, borderWidth: size * 0.08 },
      ]}
    >
      <Waves color={colors.tealForeground} size={size * 0.55} strokeWidth={2.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.navy,
  },
});

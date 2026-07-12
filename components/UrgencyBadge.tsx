import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, urgencyColors } from '../lib/theme';

export function UrgencyBadge({ urgency }: { urgency: 'low' | 'medium' | 'high' }) {
  const bg = urgencyColors[urgency];
  const fg = urgency === 'medium' ? colors.warnForeground : colors.tealForeground;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{urgency.toUpperCase()} URGENCY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});

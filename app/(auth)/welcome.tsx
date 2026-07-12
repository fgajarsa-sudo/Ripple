import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '../../components/Logo';
import { colors, fonts, radius } from '../../lib/theme';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brand}>
        <Logo size={64} />
        <Text style={styles.title}>ripple</Text>
        <Text style={styles.subtitle}>Citizen-science water-quality monitoring</Text>
      </View>

      <View style={styles.actions}>
        <Link href="/(auth)/sign-in" style={[styles.button, styles.primaryButton]}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </Link>
        <Link href="/(auth)/sign-up" style={[styles.button, styles.secondaryButton]}>
          <Text style={styles.secondaryButtonText}>Create account</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: 'space-between',
    padding: 24,
  },
  brand: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.navy,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.tealForeground,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.teal,
  },
  secondaryButtonText: {
    color: colors.teal,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});

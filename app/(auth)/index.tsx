import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.title}>Ripple</Text>
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
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    padding: 24,
  },
  brand: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#0f4c5c',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#4a5a5f',
    textAlign: 'center',
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#0f4c5c',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0f4c5c',
  },
  secondaryButtonText: {
    color: '#0f4c5c',
    fontSize: 16,
    fontWeight: '600',
  },
});

import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { supabase } from '../../lib/supabase';

const schema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  ageAttested: z.boolean().refine((v) => v, 'You must confirm you are 13 or older'),
});

export default function SignUp() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageAttested, setAgeAttested] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    const parsed = schema.safeParse({ displayName, email, password, ageAttested });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    // handle_new_user() trigger (migration 001) reads this metadata to seed
    // profiles.display_name and profiles.age_attested_at.
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          display_name: parsed.data.displayName,
          age_attested: true,
        },
      },
    });
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    router.replace('/(auth)/join-group');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <TextInput
        style={styles.input}
        placeholder="Display name"
        onChangeText={setDisplayName}
        value={displayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        value={email}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        onChangeText={setPassword}
        value={password}
      />

      <View style={styles.attestationRow}>
        <Switch value={ageAttested} onValueChange={setAgeAttested} />
        <Text style={styles.attestationText}>I confirm I am 13 or older</Text>
      </View>

      <Text style={styles.legalText}>
        By creating an account you agree to the{' '}
        <Text style={styles.legalLink}>Privacy Policy</Text> and{' '}
        <Text style={styles.legalLink}>Terms</Text>.
      </Text>

      {errorMessage && <Text style={styles.formError}>{errorMessage}</Text>}

      <Pressable style={styles.button} onPress={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </Pressable>

      <Link href="/(auth)/sign-in" style={styles.link}>
        <Text>Already have an account? Sign in</Text>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#0f4c5c', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#c9d3d4', borderRadius: 10, padding: 14, fontSize: 16 },
  attestationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  attestationText: { fontSize: 15, flexShrink: 1 },
  legalText: { fontSize: 13, color: '#4a5a5f' },
  legalLink: { textDecorationLine: 'underline' },
  formError: { color: '#b3261e', fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, alignSelf: 'center' },
});

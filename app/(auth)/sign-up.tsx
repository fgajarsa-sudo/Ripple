import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { ErrorText, Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts } from '../../lib/theme';
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
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);

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
    const { data, error } = await supabase.auth.signUp({
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
    // Supabase issues no session until the email is confirmed (project-dependent) — without
    // this check, the app would silently push forward into join-group with no real session,
    // and every subsequent authenticated action would fail with an opaque permission error.
    if (!data.session) {
      setAwaitingEmailConfirmation(true);
      return;
    }
    router.replace('/(auth)/join-group');
  };

  if (awaitingEmailConfirmation) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenTitle>Check your email</ScreenTitle>
        <Text style={styles.legalText}>
          We sent a confirmation link to {email}. Tap it, then come back and sign in below.
        </Text>
        <PillButton title="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTitle>Create account</ScreenTitle>

      <Input placeholder="Display name" onChangeText={setDisplayName} value={displayName} />
      <Input
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        value={email}
      />
      <Input placeholder="Password" secureTextEntry onChangeText={setPassword} value={password} />

      <View style={styles.attestationRow}>
        <Switch value={ageAttested} onValueChange={setAgeAttested} trackColor={{ true: colors.teal }} />
        <Text style={styles.attestationText}>I confirm I am 13 or older</Text>
      </View>

      <Text style={styles.legalText}>
        By creating an account you agree to the{' '}
        <Text style={styles.legalLink}>Privacy Policy</Text> and{' '}
        <Text style={styles.legalLink}>Terms</Text>.
      </Text>

      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}

      <View style={styles.buttonSpacing}>
        <PillButton title="Create account" onPress={onSubmit} loading={isSubmitting} />
      </View>

      <Link href="/(auth)/sign-in" style={styles.link}>
        <Text style={styles.linkText}>Already have an account? Sign in</Text>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 24, justifyContent: 'center', gap: 12 },
  attestationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  attestationText: { fontSize: 15, flexShrink: 1, fontFamily: fonts.body, color: colors.foreground },
  legalText: { fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body },
  legalLink: { textDecorationLine: 'underline' },
  buttonSpacing: { marginTop: 8 },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { fontFamily: fonts.body, color: colors.mutedForeground },
});

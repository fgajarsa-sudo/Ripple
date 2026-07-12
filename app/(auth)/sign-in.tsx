import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Logo } from '../../components/Logo';
import { ErrorText, Input, PillButton, ScreenTitle } from '../../components/ui';
import { colors, fonts } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brand}>
        <Logo size={48} />
        <Text style={styles.tagline}>One reading. One ripple.</Text>
      </View>

      <ScreenTitle>Sign in</ScreenTitle>

      <Input
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        value={email}
      />
      <Input placeholder="Password" secureTextEntry onChangeText={setPassword} value={password} />

      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}

      <View style={styles.buttonSpacing}>
        <PillButton title="Sign in" onPress={onSubmit} loading={isSubmitting} />
      </View>

      <Link href="/(auth)/sign-up" style={styles.link}>
        <Text style={styles.linkText}>Don&apos;t have an account? Create one</Text>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream, padding: 24, justifyContent: 'center', gap: 12 },
  brand: { alignItems: 'center', gap: 10, marginBottom: 16 },
  tagline: { fontFamily: fonts.display, fontSize: 17, color: colors.navy, textAlign: 'center' },
  buttonSpacing: { marginTop: 8 },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { fontFamily: fonts.body, color: colors.mutedForeground },
});

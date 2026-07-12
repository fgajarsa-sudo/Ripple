import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps } from 'react-native';

import { colors, fonts, radius } from '../lib/theme';

export function ScreenTitle({ children }: { children: string }) {
  return <Text style={titleStyles.title}>{children}</Text>;
}

const titleStyles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.navy },
});

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.mutedForeground} style={inputStyles.input} {...props} />;
}

const inputStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
});

type PillButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
};

export function PillButton({ title, onPress, disabled, loading, variant = 'primary' }: PillButtonProps) {
  const isPrimary = variant === 'primary';
  const isDestructive = variant === 'destructive';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        buttonStyles.button,
        isPrimary && buttonStyles.primary,
        isDestructive && buttonStyles.destructive,
        variant === 'secondary' && buttonStyles.secondary,
        (disabled || loading) && buttonStyles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary || isDestructive ? colors.tealForeground : colors.teal} />
      ) : (
        <Text
          style={[
            buttonStyles.text,
            (isPrimary || isDestructive) && buttonStyles.textOnColor,
            variant === 'secondary' && buttonStyles.textSecondary,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  destructive: {
    backgroundColor: colors.destructive,
    shadowColor: colors.destructive,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.teal,
  },
  disabled: { opacity: 0.5 },
  text: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  textOnColor: { color: colors.tealForeground },
  textSecondary: { color: colors.teal },
});

export function ErrorText({ children }: { children: string }) {
  return <Text style={errorStyles.text}>{children}</Text>;
}

const errorStyles = StyleSheet.create({
  text: { color: colors.destructive, fontSize: 14, textAlign: 'center', fontFamily: fonts.body },
});

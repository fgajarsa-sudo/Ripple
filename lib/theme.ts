// Design tokens extracted from the reference Lovable prototype (oklch → hex, since React
// Native doesn't support oklch()). See CLAUDE.md for how these were captured.
export const colors = {
  cream: '#f6f9f7',
  navy: '#193841',
  teal: '#16827d',
  tealForeground: '#f6f9f7',
  warn: '#f2823b',
  warnForeground: '#241005',
  foreground: '#081e24',
  card: '#ffffff',
  secondary: '#e7f1f1',
  muted: '#e7f1f1',
  mutedForeground: '#57666b',
  accent: '#d2efec',
  destructive: '#e62c2c',
  destructiveForeground: '#fafafa',
  border: '#d7e0e0',
};

// Prototype badge convention: low urgency reuses the primary teal, not a separate green.
export const urgencyColors: Record<'low' | 'medium' | 'high', string> = {
  low: colors.teal,
  medium: colors.warn,
  high: colors.destructive,
};

export const fonts = {
  display: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodySemiBold: 'Inter_600SemiBold',
};

export const radius = {
  md: 14, // 0.875rem
  pill: 9999,
};

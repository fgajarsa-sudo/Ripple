import * as Sentry from '@sentry/react-native';

// EXPO_PUBLIC_SENTRY_DSN is unset in local dev until Sentry project setup is done — the SDK
// no-ops safely with an empty/undefined dsn rather than throwing, so this is safe to call
// unconditionally.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Some pilot orgs' volunteers are minors (age-gated at signup, see migration 001) — keep
  // Sentry's automatic device/user PII collection off. Crash/error context only.
  sendDefaultPii: false,
  debug: __DEV__,
});

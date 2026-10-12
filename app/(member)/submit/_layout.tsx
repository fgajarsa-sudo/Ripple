import { Stack } from 'expo-router';

// The submit draft provider lives one level up, in app/(member)/_layout.tsx, so Home can set
// which collection a reading is for before this flow starts. Don't add a provider here.
export default function SubmitLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

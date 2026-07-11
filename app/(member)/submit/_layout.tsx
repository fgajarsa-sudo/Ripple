import { Stack } from 'expo-router';

import { SubmitDraftProvider } from '../../../lib/SubmitDraftContext';

export default function SubmitLayout() {
  return (
    <SubmitDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SubmitDraftProvider>
  );
}

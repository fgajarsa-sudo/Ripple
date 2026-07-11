import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Push tokens can't be minted without a real EAS project ID (not configured until `eas
// init` runs against a logged-in Expo account) and never work inside Expo Go regardless —
// per spec §13 Phase 5.5, this must fail silently in both cases rather than block sign-in,
// since the notification composer gets an in-app preview instead during the pre-MOU demo.
export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('profiles').update({ expo_push_token: data }).eq('id', userId);
  } catch {
    // Expected in Expo Go / without an EAS project configured — see comment above.
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  await supabase.from('profiles').update({ expo_push_token: null }).eq('id', userId);
}

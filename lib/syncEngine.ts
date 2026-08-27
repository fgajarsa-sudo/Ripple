import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import {
  listQueuedSubmissions,
  markQueueItemStatus,
  removeQueueItem,
  type QueuedSubmission,
} from './offlineQueue';
import { supabase } from './supabase';

let isSyncing = false;

async function uploadPhoto(orgId: string, photoLocalUri: string): Promise<string> {
  const response = await fetch(photoLocalUri);
  const blob = await response.blob();
  const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage
    .from('submission-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

async function notifySynced() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Reading synced', body: 'Your queued submission was uploaded.' },
      trigger: null,
    });
  } catch {
    // Best-effort — local notifications aren't available in every environment (e.g. Expo
    // Go), and a missed notification shouldn't be treated as a sync failure.
  }
}

async function syncOne(item: QueuedSubmission): Promise<void> {
  await markQueueItemStatus(item.syncClientId, 'syncing');
  try {
    const photoPath = item.photoLocalUri ? await uploadPhoto(item.orgId, item.photoLocalUri) : null;

    const { error } = await supabase.from('submissions').insert({
      org_id: item.orgId,
      user_id: item.userId,
      site_id: item.siteId,
      lat: item.lat,
      lng: item.lng,
      captured_at: item.capturedAt,
      weather: item.weather,
      notes: item.notes,
      readings: item.readings,
      photo_path: photoPath,
      sync_client_id: item.syncClientId,
    });

    // A unique-violation on sync_client_id means a previous attempt already succeeded
    // server-side even though this client never got the response (e.g. connection dropped
    // right after insert) — that's a successful sync, not a failure. This is the whole
    // point of sync_client_id: retries can't create duplicates.
    if (error && error.code !== '23505') throw error;

    await removeQueueItem(item.syncClientId, item.photoLocalUri);
    await notifySynced();
  } catch (err) {
    await markQueueItemStatus(item.syncClientId, 'failed', err instanceof Error ? err.message : 'Sync failed');
  }
}

export async function runSync(userId: string): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const items = await listQueuedSubmissions(userId);
    // Retries failed items too (no backoff) — simple and sufficient for pilot volume;
    // 'syncing' items are mid-flight from a concurrent call and skipped.
    const runnable = items.filter((i) => i.status !== 'syncing');
    for (const item of runnable) {
      await syncOne(item);
    }
  } finally {
    isSyncing = false;
  }
}

export function startSyncListeners(userId: string): () => void {
  void runSync(userId);

  const netSubscription = NetInfo.addEventListener((state) => {
    if (state.isConnected) void runSync(userId);
  });

  // Lakes have notoriously spotty signal, and iOS suspends JS execution while the app is
  // backgrounded — so a NetInfo "connected" transition can happen while the screen is off
  // and never reach this listener. Re-check whenever the app comes back to the foreground
  // too; that's what actually catches "took several readings in a dead zone, phone regained
  // signal while it sat in a pocket with the screen locked."
  const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') void runSync(userId);
  });

  // Safety net on top of both: retry on a fixed interval in case connectivity flickers back
  // without a clean transition event either way. Cheap — runSync() reads the local queue and
  // exits immediately once it's empty.
  const intervalId = setInterval(() => void runSync(userId), 60_000);

  return () => {
    netSubscription();
    appStateSubscription.remove();
    clearInterval(intervalId);
  };
}

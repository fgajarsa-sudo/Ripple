import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { SubmitDraft } from './SubmitDraftContext';

export type QueueStatus = 'pending' | 'syncing' | 'failed';

export type QueuedSubmission = {
  syncClientId: string;
  orgId: string;
  userId: string;
  siteId: string | null;
  siteName: string | null;
  lat: number;
  lng: number;
  capturedAt: string;
  weather: string | null;
  notes: string | null;
  readings: Record<string, number>;
  photoLocalUri: string | null;
  status: QueueStatus;
  errorMessage: string | null;
  createdAt: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('ripple-offline-queue.db').then(async (db) => {
      await db.execAsync(`
        create table if not exists queued_submissions (
          sync_client_id text primary key,
          org_id text not null,
          user_id text not null,
          site_id text,
          site_name text,
          lat real not null,
          lng real not null,
          captured_at text not null,
          weather text,
          notes text,
          readings text not null,
          photo_local_uri text,
          status text not null default 'pending',
          error_message text,
          created_at text not null default (datetime('now'))
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The camera writes to a cache location that isn't guaranteed to survive until the device
// is back online and syncing runs — copy into the app's permanent document directory so a
// queued photo isn't lost from underneath a pending submission.
async function persistPhoto(uri: string, syncClientId: string): Promise<string> {
  const queueDir = new Directory(Paths.document, 'queued-photos');
  if (!queueDir.exists) queueDir.create({ intermediates: true });
  const source = new File(uri);
  const dest = new File(queueDir, `${syncClientId}.jpg`);
  source.copy(dest);
  return dest.uri;
}

export async function enqueueSubmission(
  draft: SubmitDraft,
  orgId: string,
  userId: string
): Promise<string> {
  if (draft.lat === null || draft.lng === null) {
    throw new Error('Location is required');
  }
  const db = await getDb();
  const syncClientId = generateId();
  const photoLocalUri = draft.photoUri ? await persistPhoto(draft.photoUri, syncClientId) : null;

  await db.runAsync(
    `insert into queued_submissions
      (sync_client_id, org_id, user_id, site_id, site_name, lat, lng, captured_at, weather, notes, readings, photo_local_uri, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      syncClientId,
      orgId,
      userId,
      draft.siteId,
      draft.siteName,
      draft.lat,
      draft.lng,
      draft.capturedAt,
      draft.weather,
      draft.notes || null,
      JSON.stringify(draft.readings),
      photoLocalUri,
    ]
  );

  return syncClientId;
}

type QueueRow = {
  sync_client_id: string;
  org_id: string;
  user_id: string;
  site_id: string | null;
  site_name: string | null;
  lat: number;
  lng: number;
  captured_at: string;
  weather: string | null;
  notes: string | null;
  readings: string;
  photo_local_uri: string | null;
  status: QueueStatus;
  error_message: string | null;
  created_at: string;
};

function rowToQueuedSubmission(row: QueueRow): QueuedSubmission {
  return {
    syncClientId: row.sync_client_id,
    orgId: row.org_id,
    userId: row.user_id,
    siteId: row.site_id,
    siteName: row.site_name,
    lat: row.lat,
    lng: row.lng,
    capturedAt: row.captured_at,
    weather: row.weather,
    notes: row.notes,
    readings: JSON.parse(row.readings),
    photoLocalUri: row.photo_local_uri,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export async function listQueuedSubmissions(userId: string): Promise<QueuedSubmission[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueRow>(
    'select * from queued_submissions where user_id = ? order by created_at desc',
    [userId]
  );
  return rows.map(rowToQueuedSubmission);
}

export async function countQueuedSubmissions(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'select count(*) as count from queued_submissions where user_id = ?',
    [userId]
  );
  return row?.count ?? 0;
}

export async function markQueueItemStatus(
  syncClientId: string,
  status: QueueStatus,
  errorMessage: string | null = null
): Promise<void> {
  const db = await getDb();
  await db.runAsync('update queued_submissions set status = ?, error_message = ? where sync_client_id = ?', [
    status,
    errorMessage,
    syncClientId,
  ]);
}

export async function removeQueueItem(syncClientId: string, photoLocalUri: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from queued_submissions where sync_client_id = ?', [syncClientId]);
  if (photoLocalUri) {
    try {
      new File(photoLocalUri).delete();
    } catch {
      // best-effort cleanup; a leftover file in queued-photos/ isn't worth failing sync over
    }
  }
}

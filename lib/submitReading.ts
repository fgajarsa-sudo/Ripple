import { supabase } from './supabase';
import type { SubmitDraft } from './SubmitDraftContext';

type SubmissionResult = {
  id: string;
  ai_urgency: 'low' | 'medium' | 'high' | null;
};

async function uploadPhoto(orgId: string, photoUri: string): Promise<string> {
  const response = await fetch(photoUri);
  const blob = await response.blob();
  const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { error } = await supabase.storage
    .from('submission-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;

  return path;
}

export async function submitReading(
  draft: SubmitDraft,
  orgId: string,
  userId: string
): Promise<SubmissionResult> {
  if (draft.lat === null || draft.lng === null) {
    throw new Error('Location is required');
  }

  const photoPath = draft.photoUri ? await uploadPhoto(orgId, draft.photoUri) : null;

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      org_id: orgId,
      user_id: userId,
      site_id: draft.siteId,
      lat: draft.lat,
      lng: draft.lng,
      captured_at: draft.capturedAt,
      weather: draft.weather,
      notes: draft.notes || null,
      readings: draft.readings,
      photo_path: photoPath,
    })
    .select('id, ai_urgency')
    .single();

  if (error) throw error;
  return data;
}

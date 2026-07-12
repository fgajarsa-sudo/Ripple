// Ripple — export-org-data Edge Function (spec §6 screen 14, admin CSV export)
//
// Deployed WITH default JWT verification (same reasoning as send-notification — the caller
// is a logged-in admin, not a webhook). Deliberately queries through a client scoped to the
// caller's own JWT rather than the service role: submissions RLS already lets an org's
// admins read every row in their org (exact GPS included, by design — the org owns its
// data), so there's no need to bypass RLS here at all, only to identify who's asking.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SENSOR_PARAMETERS = ['ph', 'temp_f', 'ec', 'tds', 'salinity', 'specific_gravity', 'orp'];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  const url = new URL(req.url);
  const orgId = url.searchParams.get('org_id') ?? (await req.json().catch(() => ({})))?.org_id;
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'org_id is required' }), { status: 400 });
  }

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { data: membership } = await userClient
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Only org admins can export data' }), { status: 403 });
  }

  const { data: submissions, error: queryError } = await userClient
    .from('submissions')
    .select(
      'id, captured_at, lat, lng, weather, notes, readings, photo_path, ai_urgency, ai_summary, review_status, reviewer_note, created_at, profiles!submissions_user_id_fkey(display_name), sites(name)'
    )
    .eq('org_id', orgId)
    .order('captured_at', { ascending: false });

  if (queryError) {
    return new Response(JSON.stringify({ error: queryError.message }), { status: 500 });
  }

  const headerCols = [
    'id',
    'submitted_by',
    'site',
    'captured_at',
    'lat',
    'lng',
    'weather',
    ...SENSOR_PARAMETERS,
    'has_photo',
    'ai_urgency',
    'ai_summary',
    'review_status',
    'reviewer_note',
    'notes',
  ];
  const lines = [headerCols.join(',')];

  for (const row of submissions ?? []) {
    const readings = (row.readings ?? {}) as Record<string, number>;
    const cols = [
      row.id,
      (row as any).profiles?.display_name ?? '',
      (row as any).sites?.name ?? '',
      row.captured_at,
      row.lat,
      row.lng,
      row.weather ?? '',
      ...SENSOR_PARAMETERS.map((p) => readings[p] ?? ''),
      row.photo_path ? 'yes' : 'no',
      row.ai_urgency ?? '',
      row.ai_summary ?? '',
      row.review_status,
      row.reviewer_note ?? '',
      row.notes ?? '',
    ];
    lines.push(cols.map(csvEscape).join(','));
  }

  const csv = lines.join('\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ripple-export-${orgId}.csv"`,
    },
  });
});

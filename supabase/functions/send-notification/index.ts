// Ripple — send-notification Edge Function (spec §9, admin-composed notifications)
//
// Called directly by the mobile app (admin composer screen), not a database webhook — so
// this one keeps default JWT verification (deployed WITHOUT --no-verify-jwt), unlike
// analyze-submission. The caller's own JWT is used to verify they're actually an org admin
// (via an RLS-respecting client), then a service-role client does the actual token
// resolution and write, since `notifications` has no INSERT policy for regular users by
// design (§5: "INSERT via Edge Function only").

import { createClient } from 'npm:@supabase/supabase-js@2';

type Target = 'all' | 'active_30d' | 'site';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await req.json();
  const orgId: string = body.org_id;
  const title: string = body.title;
  const notifBody: string = body.body;
  const target: Target = body.target;
  const targetSiteId: string | null = body.target_site_id ?? null;

  if (!orgId || !title || !notifBody || !target) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }
  if (target === 'site' && !targetSiteId) {
    return new Response(JSON.stringify({ error: 'target_site_id required for site targeting' }), {
      status: 400,
    });
  }

  const { data: membership } = await userClient
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Only org admins can send notifications' }), {
      status: 403,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const userIds = await resolveTargetUserIds(adminClient, orgId, target, targetSiteId);

  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

  const tokens = (profiles ?? [])
    .map((p: any) => p.expo_push_token)
    .filter((t: string | null): t is string => !!t);

  const deadTokens = await sendPushInChunks(tokens, title, notifBody);

  if (deadTokens.length > 0) {
    await adminClient.from('profiles').update({ expo_push_token: null }).in('expo_push_token', deadTokens);
  }

  await adminClient.from('notifications').insert({
    org_id: orgId,
    sent_by: user.id,
    title,
    body: notifBody,
    target,
    target_site_id: targetSiteId,
    recipient_count: tokens.length,
  });

  return new Response(JSON.stringify({ ok: true, recipientCount: tokens.length }), {
    headers: { 'content-type': 'application/json' },
  });
});

async function resolveTargetUserIds(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  target: Target,
  targetSiteId: string | null
): Promise<string[]> {
  if (target === 'all') {
    const { data } = await adminClient
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('status', 'active');
    return (data ?? []).map((r: any) => r.user_id);
  }

  if (target === 'active_30d') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await adminClient
      .from('submissions')
      .select('user_id')
      .eq('org_id', orgId)
      .gte('created_at', since);
    return [...new Set((data ?? []).map((r: any) => r.user_id))];
  }

  // target === 'site': submitters at that site in the last 90d, union site subscribers
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: submitters }, { data: subscribers }] = await Promise.all([
    adminClient
      .from('submissions')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('site_id', targetSiteId)
      .gte('created_at', since90),
    adminClient.from('site_subscriptions').select('user_id').eq('site_id', targetSiteId),
  ]);
  return [
    ...new Set([
      ...(submitters ?? []).map((r: any) => r.user_id),
      ...(subscribers ?? []).map((r: any) => r.user_id),
    ]),
  ];
}

async function sendPushInChunks(tokens: string[], title: string, body: string): Promise<string[]> {
  const deadTokens: string[] = [];
  const CHUNK_SIZE = 100;

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((to) => ({ to, title, body }));

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const result = await response.json();
      const tickets = result.data ?? [];
      // Expo returns "DeviceNotRegistered" synchronously in the ticket for many dead
      // tokens; the rest only surface later via the separate receipt-fetch flow, which
      // isn't implemented here — this prunes what's cheaply available now.
      tickets.forEach((ticket: any, idx: number) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(chunk[idx]);
        }
      });
    } catch (err) {
      console.error('send-notification: push chunk failed', err);
    }
  }

  return deadTokens;
}

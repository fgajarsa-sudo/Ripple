// Ripple — delete-account Edge Function (spec §7 screen 8, §13 Phase 5)
//
// Deployed WITH default JWT verification (same reasoning as send-notification/
// export-org-data — the caller is a logged-in member deleting their own account, not a
// webhook). Resolves the caller from their own JWT, then a service-role client calls the
// GoTrue admin API to delete the auth.users row. `profiles` cascades from that (on delete
// cascade, migration 001) — that's where all PII lives (display_name, expo_push_token), so
// deleting it is the whole job. Everything the org owns (submissions, review/notification
// attribution, invites the user created) survives with user_id/reviewed_by/sent_by/
// created_by set to NULL instead of being deleted, per migration 007 — matches the data
// agreement ("former member").

import { createClient } from 'npm:@supabase/supabase-js@2';

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
});

// Ripple — analyze-submission Edge Function (spec §7)
//
// Triggered by a database webhook (migration 003) on `submissions` INSERT. Deployed with
// --no-verify-jwt since the caller is Postgres, not a user session; instead this function
// checks a shared secret header set by the trigger (WEBHOOK_SECRET) against its own copy
// in Edge Function secrets, so it can't be invoked by an arbitrary internet request.
//
// Guardrail (§7.3): the rule-based severity from migration 002's INSERT trigger is already
// sitting on `record.ai_urgency` by the time this runs — AI can raise that but can never
// lower a rule-based HIGH. Final urgency = max(rule-based, AI).
//
// Failure mode (§7.5): a submission must never be lost or blocked because AI is down. If
// the Claude call fails after retries, this function leaves ai_urgency at its rule-based
// value (already committed by the INSERT trigger) and ai_summary stays null — no write
// needed, no submission is blocked. This is in-function retry only (a couple of attempts
// with backoff); a durable, persistent retry queue that survives an Edge Function outage
// entirely is not built yet.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };

function maxSeverity(a: string | null, b: string | null): string | null {
  const ra = a ? (SEVERITY_RANK[a] ?? 0) : 0;
  const rb = b ? (SEVERITY_RANK[b] ?? 0) : 0;
  if (ra === 0 && rb === 0) return null;
  return ra >= rb ? a : b;
}

type Submission = {
  id: string;
  org_id: string;
  site_id: string | null;
  readings: Record<string, number>;
  photo_path: string | null;
  ai_urgency: string | null;
};

async function callClaudeWithRetry(
  apiKey: string,
  body: unknown,
  attempts = 3
): Promise<{ json: any; usage: { input_tokens: number; output_tokens: number } } | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Claude API returned ${response.status}`);
      const data = await response.json();
      const text = data.content?.find((b: any) => b.type === 'text')?.text ?? '';
      const parsed = JSON.parse(text);
      return { json: parsed, usage: data.usage ?? { input_tokens: 0, output_tokens: 0 } };
    } catch (err) {
      if (attempt === attempts) {
        console.error('analyze-submission: Claude call failed after retries', err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

async function sendHighUrgencyPush(supabase: ReturnType<typeof createClient>, orgId: string, submissionId: string) {
  const { data: staff } = await supabase
    .from('memberships')
    .select('user_id, profiles!inner(expo_push_token)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role', ['admin', 'reviewer']);

  const tokens = (staff ?? [])
    .map((row: any) => row.profiles?.expo_push_token)
    .filter((t: string | null): t is string => !!t);

  if (tokens.length === 0) return;

  const messages = tokens.map((to: string) => ({
    to,
    title: 'High-urgency reading flagged',
    body: 'A submission needs review.',
    data: { submissionId },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  }).catch((err) => console.error('analyze-submission: push send failed', err));
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret && req.headers.get('x-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const record: Submission = payload.record;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const ruleBasedUrgency = record.ai_urgency;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Rule-based urgency (already committed by migration 002's INSERT trigger) is left as
    // the final value — a submission is never blocked because AI is down/unconfigured.
    console.error('analyze-submission: ANTHROPIC_API_KEY not set, leaving rule-based urgency as-is');
    if (ruleBasedUrgency === 'high') await sendHighUrgencyPush(supabase, record.org_id, record.id);
    return new Response(JSON.stringify({ ok: true, urgency: ruleBasedUrgency, ai_skipped: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // Deliberately always calls Claude even when rule-based severity is already HIGH: the
  // guardrail below stops AI from ever *lowering* a rule-based HIGH, but skipping the call
  // entirely would mean the most important submissions never get a summary or photo
  // analysis for reviewers — exactly the ones where that matters most.
  const { data: thresholds } = await supabase
    .from('thresholds')
    .select('parameter, min_value, max_value, severity')
    .eq('org_id', record.org_id);

  let site = null;
  if (record.site_id) {
    const { data } = await supabase.from('sites').select('name').eq('id', record.site_id).single();
    site = data;
  }

  const imageBlocks: any[] = [];
  if (record.photo_path) {
    const { data: signedUrl } = await supabase.storage
      .from('submission-photos')
      .createSignedUrl(record.photo_path, 60);
    if (signedUrl?.signedUrl) {
      const imageResponse = await fetch(signedUrl.signedUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      imageBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
      });
    }
  }

  const promptText = `You are assessing a citizen-science water quality reading for a lake conservation group.

Site: ${site?.name ?? 'unknown'}
Sensor readings: ${JSON.stringify(record.readings)}
Org's threshold rules: ${JSON.stringify(thresholds)}
Rule-based severity already computed from thresholds alone: ${ruleBasedUrgency ?? 'none (no readings)'}

Look at the attached photo (if present) for visible signs of algal bloom, discoloration, debris, or other anomalies. Respond with ONLY strict JSON, no other text, in this exact shape:
{"urgency": "low" | "medium" | "high", "summary": string, "flags": string[], "photo_observations": string}

Your "urgency" may raise the rule-based severity above (e.g. a visible algal bloom despite normal readings) but should not casually override it downward.`;

  const result = await callClaudeWithRetry(apiKey, {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: promptText }, ...imageBlocks],
      },
    ],
  });

  let finalUrgency = ruleBasedUrgency;
  let aiSummary: string | null = null;
  let aiFlags: unknown = null;

  if (result) {
    finalUrgency = maxSeverity(ruleBasedUrgency, result.json.urgency ?? null);
    aiSummary = result.json.summary ?? null;
    aiFlags = { flags: result.json.flags ?? [], photo_observations: result.json.photo_observations ?? null };

    await supabase.from('ai_usage_log').insert({
      submission_id: record.id,
      org_id: record.org_id,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
    });
  }

  await supabase
    .from('submissions')
    .update({ ai_urgency: finalUrgency, ai_summary: aiSummary, ai_flags: aiFlags })
    .eq('id', record.id);

  if (finalUrgency === 'high') {
    await sendHighUrgencyPush(supabase, record.org_id, record.id);
  }

  return new Response(JSON.stringify({ ok: true, urgency: finalUrgency, ai_skipped: !result }), {
    headers: { 'content-type': 'application/json' },
  });
});

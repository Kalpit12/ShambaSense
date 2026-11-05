// SMS case updates (architecture.md §10): sends the texts waiting in `sms_outbox` through Africa's
// Talking, and takes Africa's Talking's delivery reports. Same Africa's Talking account as `send-sms`.
//
// Two callers, both need the shared secret, since verify_jwt is off for this function:
//   POST /send-updates                     from pg_cron every minute, header x-sender-secret: <secret>
//   POST /send-updates?report=<secret>     Africa's Talking delivery report (form data: id, status, failureReason)
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SMS_SENDER_SECRET   any long random string; also stored in Vault for the cron job (supabase/README.md)
//   AT_USERNAME, AT_API_KEY, AT_SENDER_ID   as for send-sms
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const secret = Deno.env.get('SMS_SENDER_SECRET') ?? '';
const username = Deno.env.get('AT_USERNAME') ?? '';
const apiKey = Deno.env.get('AT_API_KEY') ?? '';
const senderId = Deno.env.get('AT_SENDER_ID') ?? '';
const sandbox = username === 'sandbox';
const endpoint = `https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1/messaging`;
// Processed, Sent, Queued.
const ACCEPTED = [100, 101, 102];
// Codes worth a retry later: risk hold, could not route, gateway error, throttled.
const RETRY = [401, 403, 500, 501, 502];

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Row = { id: string; phone: string; body: string };

async function sendOne(row: Row) {
  const form = new URLSearchParams({ username, to: row.phone, message: row.body });
  if (senderId && !sandbox) form.set('from', senderId);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) return { status: res.status >= 500 ? 'queued' : 'failed', error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    const r = JSON.parse(text)?.SMSMessageData?.Recipients?.[0] as { status?: string; statusCode?: number; messageId?: string } | undefined;
    const code = Number(r?.statusCode);
    if (r && ACCEPTED.includes(code)) return { status: 'sent', providerId: r.messageId ?? null };
    return { status: RETRY.includes(code) ? 'queued' : 'failed', error: r?.status ?? text.slice(0, 200) };
  } catch (e) {
    return { status: 'queued', error: `Could not reach Africa's Talking: ${e instanceof Error ? e.message : e}` };
  }
}

async function drain() {
  if (!username || !apiKey) return json(503, { error: 'SMS is not set up yet.' });
  const { data, error } = await db.rpc('claim_sms_batch', { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const rows = (data ?? []) as Row[];
  let sent = 0;
  for (const row of rows) {
    const out = await sendOne(row);
    if (out.status === 'sent') sent++;
    const { error: markError } = await db.rpc('mark_sms', {
      p_id: row.id,
      p_status: out.status,
      p_provider_id: 'providerId' in out ? out.providerId : null,
      p_error: 'error' in out ? out.error : null,
    });
    if (markError) console.error('send-updates mark', row.id, markError.message);
  }
  return json(200, { claimed: rows.length, sent });
}

async function report(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = String(form?.get('id') ?? '');
  const status = String(form?.get('status') ?? '');
  if (!id || !status) return json(400, { error: 'id and status needed' });
  const { error } = await db.rpc('sms_delivery_report', {
    p_provider_id: id,
    p_status: status,
    p_reason: form?.get('failureReason') ? String(form.get('failureReason')) : null,
  });
  if (error) return json(500, { error: error.message });
  // Africa's Talking only needs a 200.
  return json(200, {});
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!secret) return json(503, { error: 'SMS_SENDER_SECRET is not set.' });
  const reportKey = new URL(req.url).searchParams.get('report');
  if (reportKey !== null) return same(reportKey, secret) ? report(req) : json(401, { error: 'Bad key.' });
  if (!same(req.headers.get('x-sender-secret') ?? '', secret)) return json(401, { error: 'Bad key.' });
  return drain();
});

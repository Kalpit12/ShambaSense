// Supabase Auth "Send SMS" hook: sends the sign-in code through Africa's Talking (architecture.md §9).
// Auth signs each call with the hook secret, so only Supabase can make this function send a message.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SEND_SMS_HOOK_SECRET  the "v1,whsec_..." secret Supabase shows when the hook is turned on
//   AT_USERNAME           "sandbox" while testing (messages show in the Africa's Talking simulator),
//                         the live app's username later
//   AT_API_KEY            the API key for that username
//   AT_SENDER_ID          optional, live only: an approved sender name such as SHAMBASENSE

import { Webhook } from 'npm:standardwebhooks@1.1.1';

const hookSecret = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
const username = Deno.env.get('AT_USERNAME') ?? '';
const apiKey = Deno.env.get('AT_API_KEY') ?? '';
const senderId = Deno.env.get('AT_SENDER_ID') ?? '';
const sandbox = username === 'sandbox';
const endpoint = `https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1/messaging`;

// Africa's Talking codes that mean the message was taken: Processed, Sent, Queued.
const ACCEPTED = [100, 101, 102];

const fail = (status: number, message: string) => {
  console.error('send-sms', status, message);
  return new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } });
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (!hookSecret || !username || !apiKey) return fail(500, 'SMS is not set up yet.');

  const payload = await req.text();
  let phone = '';
  let otp = '';
  try {
    const event = new Webhook(hookSecret).verify(payload, Object.fromEntries(req.headers)) as { user: { phone?: string }; sms: { otp: string } };
    phone = String(event.user?.phone ?? '').replace(/^\+?/, '+');
    otp = String(event.sms?.otp ?? '');
  } catch {
    return fail(401, 'Bad signature.');
  }
  if (!/^\+\d{9,15}$/.test(phone) || !/^\d{4,10}$/.test(otp)) return fail(400, 'Bad phone or code.');

  // One short message in both languages, plain ASCII so it fits in a single SMS.
  const message = `ShambaSense code: ${otp}. Usimpe mtu namba hii. Do not share this code.`;
  const body = new URLSearchParams({ username, to: phone, message });
  if (senderId && !sandbox) body.set('from', senderId);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    return fail(502, `Could not reach Africa's Talking: ${e instanceof Error ? e.message : e}`);
  }
  const text = await res.text();
  if (!res.ok) return fail(502, `Africa's Talking said ${res.status}: ${text.slice(0, 200)}`);
  let recipient: { status?: string; statusCode?: number } | undefined;
  try {
    recipient = JSON.parse(text)?.SMSMessageData?.Recipients?.[0];
  } catch {
    // handled below
  }
  if (!recipient || !ACCEPTED.includes(Number(recipient.statusCode))) {
    return fail(502, `SMS not sent: ${recipient?.status ?? text.slice(0, 200)}`);
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});

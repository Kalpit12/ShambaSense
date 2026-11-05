# ShambaSense database (Supabase)

Tables, access rules and review functions from architecture.md §5 and §6.4.

```
migrations/
  20261027200000_core_tables.sql        profiles, orgs, farms, plots, journal, checks, results, issues, causes, guides, audit log
  20261027200100_access_rules.sql       row-level security on every table (§5.6)
  20261027200200_issue_functions.sql    ask_agronomist, review_issue, set_issue_status, assign_issue_to_me, auto-issue trigger
  20261027200300_storage_and_causes.sql private check-photos bucket and the cause list
  ...
  20261105120000_sms_updates.sql        SMS case updates: outbox, opt-in, quiet hours, daily cap
tests/
  supabase-stub.sql                     stand-in auth/storage schemas for plain Postgres
  access_rules_test.sql                 signs in as farmer A, farmer B and an agronomist and checks what each can do
  run.sh                                tests/run.sh -h <host> -p <port> -U postgres
```

What the tests check: farmers only see their own farm; the journal is insert-only; a co-op agronomist
sees a farmer only while their link is active; nobody reads raw model scores; issues change only through
the functions; a reply naming a dose or product is flagged; a no-answer result opens an issue by itself;
RLS is on for every table.

Differences from architecture.md for now: phones write straight to the tables (protected by RLS) instead
of through the `apply-changes` Edge Function and PowerSync. That keeps the first connected version small;
the function and PowerSync come in when offline sync moves off the phone-only queue.

## Demo sign-in (dev only)

Until an SMS provider is set up, `20261027200500_demo_sign_in.sql` adds demo accounts that sign in
with the code **123456** and send nothing. Set `EXPO_PUBLIC_DEMO_AUTH=1` (farmer app) and
`NEXT_PUBLIC_DEMO_AUTH=1` (dashboard) to use them.

| Who | Sign in with | Notes |
|---|---|---|
| Juma, farmer | 0712 345 678 | Farm already set up, linked to the demo co-op |
| Wanjiru K., agronomist | agronomist.demo@example.com | Member of the demo co-op |
| Any new farmer | Sign up with any +254 7/1 number | Linked to the demo co-op automatically |

Before launch: `update feature_flags set enabled = false where key = 'demo_auth';`, delete the
`@example.com` users, and drop the three `demo_*` functions.

## Photo reading (`functions/diagnose`)

The farmer app calls this Edge Function after a crop check's photo is uploaded. It sends the photo to
OpenAI with the reviewed cause list for the crop and writes a `check_results` row: a possible match
(at most two causes from the list), "needs more information", or "expert review". Only tomatoes have a
reviewed library so far; other crops get `unsupported_crop` without calling the model. An agronomist
still sees every check during the pilot, with the model's answer marked "AI suggestion · not reviewed".

Secrets (Supabase → Edge Functions → Secrets):

| Name | Needed | What |
|---|---|---|
| `OPENAI_API_KEY` | yes | Key from platform.openai.com. Without it the function answers 503 and checks wait for the agronomist as before. |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.4-mini`. Must accept images. |
| `DAILY_CHECKS_PER_FARMER` | no | Photos one farmer can have read in 24 hours. Defaults to 20. |

## SMS sign-in (`functions/send-sms`)

Supabase Auth sends phone sign-in codes through the **Send SMS hook**, which calls this function; it
sends the code with Africa's Talking. While `AT_USERNAME` is `sandbox` nothing reaches a real phone:
the message shows in the Africa's Talking simulator for the number you typed. Switching to a live
Africa's Talking app (paid per SMS) is only a change of `AT_USERNAME` and `AT_API_KEY`.

`20261028230000_sms_sign_in.sql` adds the `sms_auth` flag and `sign_in_mode()`. With demo sign-in on,
demo accounts keep the code 123456 and new numbers get a real code once `sms_auth` is on:
`update feature_flags set enabled = true where key = 'sms_auth';`

| Secret | What |
|---|---|
| `SEND_SMS_HOOK_SECRET` | The `v1,whsec_...` secret shown when the hook is turned on |
| `AT_USERNAME` | `sandbox` for testing, the live app's username later |
| `AT_API_KEY` | API key for that username |
| `AT_SENDER_ID` | Optional, live only: an approved sender name |

## Error log (`app_errors`)

Both apps send crashes and failed syncs to `log_app_error`, which trims them and caps them at 50 an
hour per user. Nobody reads the table from the apps; look in Table Editor → `app_errors`, or:
`select created_at, app, platform, message, context from app_errors order by created_at desc limit 50;`
Rows older than 90 days are deleted each night.

## Weather (`functions/weather`)

The Home screen shows a 3-day forecast for the farm's county. `weather` takes `{ county }`, looks up the
county headquarters, and asks MET Norway's free Locationforecast API (CC BY 4.0, commercial use allowed,
credited on the card). Each county is cached for an hour per function instance, as MET asks. No secrets,
no tables; `verify_jwt` is on. The app keeps the last forecast on the phone and refreshes it every 3 hours.

## Co-op settings (`20261029090000_coop_settings.sql`)

Adds `county`, `contact_phone` and `crops` to `orgs`. Admins save them with `update_org_settings` (it
tidies phone numbers to +2547... and only accepts the six photo-check crops); any member sets the name
farmers see with `set_my_display_name`. `my_coops()` now returns the co-op's phone so the farmer app can
offer a Call link. The dashboard still signs in before this migration runs, with all crops on.

## SMS case updates (`functions/send-updates`)

A farmer who turns on **Text me updates** in Profile gets a short SMS in their language when an agronomist
answers a case, asks for another photo, or a follow-up photo is due (architecture.md §10). It is for
farmers who are often out of data, so push alerts never reach them. `20261105120000_sms_updates.sql` adds:

- `sms_outbox`: one row per text, `queued` → `sending` → `sent` → `delivered` (or `failed`, `expired`, `skipped`).
- A trigger on `issue_events` and a daily 08:00 job that queue texts. At most three a day per farmer, one
  follow-up text per case, nothing between 21:00 and 07:00 Nairobi time (those wait until morning), and a
  text not sent within a day is dropped. Each text is one 160-character ASCII SMS.
- `set_sms_updates(on, language)` for the app's switch. It records an `sms_updates` consent, and turning
  texts off withdraws it and drops texts still waiting.
- The `sms_updates` flag, on by default. `update feature_flags set enabled = false where key = 'sms_updates';`
  stops all new texts.

Texts only leave once the function is deployed and scheduled. Without that they wait and expire after a day.

1. Deploy with JWT checks off (the function checks its own secret):
   `supabase functions deploy send-updates --no-verify-jwt`
2. Add the secret `SMS_SENDER_SECRET` (any long random string). `AT_USERNAME`, `AT_API_KEY` and
   `AT_SENDER_ID` are shared with `send-sms`.
3. Schedule it every minute (SQL Editor, with your project ref and the same secret):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-updates', 'sms_sender_url');
   select vault.create_secret('<the same SMS_SENDER_SECRET>', 'sms_sender_secret');
   select cron.schedule('send-sms-updates', '* * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'sms_sender_url'),
       headers := jsonb_build_object('Content-Type', 'application/json',
         'x-sender-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_sender_secret')),
       body := '{}'::jsonb)
   $$);
   ```
4. In Africa's Talking → SMS → Delivery Reports, set the callback URL to
   `https://<project-ref>.supabase.co/functions/v1/send-updates?report=<SMS_SENDER_SECRET>`.

To see what went out: `select created_at, kind, status, body, error from sms_outbox order by created_at desc limit 50;`

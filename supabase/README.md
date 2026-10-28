# ShambaSense database (Supabase)

Tables, access rules and review functions from architecture.md §5 and §6.4.

```
migrations/
  20261027200000_core_tables.sql        profiles, orgs, farms, plots, journal, checks, results, issues, causes, guides, audit log
  20261027200100_access_rules.sql       row-level security on every table (§5.6)
  20261027200200_issue_functions.sql    ask_agronomist, review_issue, set_issue_status, assign_issue_to_me, auto-issue trigger
  20261027200300_storage_and_causes.sql private check-photos bucket and the cause list
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

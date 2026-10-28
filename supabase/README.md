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

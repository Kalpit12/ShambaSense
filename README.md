# ShambaSense

A farm journal and crop-check app for Kenyan smallholder farmers, in English and Kiswahili, with an
agronomist dashboard for co-ops. Farmers photograph a crop problem; an agronomist reviews it on the
dashboard; the answer, and any follow-up photo, flows back to the farmer's phone.

| Folder | What it is |
|---|---|
| `apps/farmer` | Expo (React Native) farmer app: onboarding, Shamba, Journal, crop check, results, follow-up photos. Works offline. |
| `apps/dashboard` | Next.js agronomist dashboard: crop issues queue, case review, before-and-after follow-ups. |
| `apps/web` | Landing page (single HTML file). |
| `supabase` | Postgres schema, row-level security, review functions, storage and tests. |
| `docs` | `architecture.md` and `design.md`, the source of truth for both apps. |
| `brand/logo` | Final logo files. |

## Live (test) links

- Farmer app: https://shambasense-app.vercel.app
- Dashboard: https://shambasense-dashboard.vercel.app

Both deploy automatically from `main` on Vercel (root directories `apps/farmer` and `apps/dashboard`).

## Run locally

```bash
# Farmer app (Expo). Without a .env.local it runs in preview mode on sample data, code 123456.
cd apps/farmer && npm install && npx expo start

# Dashboard (Next.js). Without a .env.local it runs on sample data.
cd apps/dashboard && npm install && npm run dev
```

To connect to Supabase, copy each app's `.env.example` to `.env.local` and fill in the project URL
and publishable key. Never put the service_role key in either app.

## Database

Apply `supabase/migrations` in order (or `supabase/all-in-one.sql`). `supabase/tests/run.sh` runs
the access-rule tests against a scratch Postgres.

## Demo sign-in (development only)

The `demo_sign_in` migration and `*_DEMO_AUTH=1` let testers sign in with the code **123456** and no
SMS or email. Demo accounts share one password that is in this repository, so anyone can sign in as
them: keep only test data in a project that has demo sign-in on, and switch it off before real
farmers use it (see `supabase/README.md`).

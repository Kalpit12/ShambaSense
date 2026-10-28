# ShambaSense dashboard

Organisation dashboard for agronomists and field officers (architecture.md §3.4, design.md §8.2 and §10).
This is Phase 3: the **Crop issues** queue, where checks that farmers sent to an agronomist, and checks the
library could not answer, get reviewed.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run build` makes a static export in `out/`. `npm run preview` writes `preview/index.html`, a single
self-contained page of the same components, used for the shareable preview.

## What works

- **Crop issues** (default page): tabs for Needs review, Waiting for farmer, Follow-up, Closed and All;
  crop filter; search by farmer, plot or case ID. Rows show photo, ID, case, crop, severity (word + shape),
  status, assignee and last update. Highest severity first, then oldest.
- **Case detail**: beside the list at 1280 px and wider, over it below that, full width on phones.
  Farmer's photo next to the similar reviewed case, what the farmer picked, the AI suggestion in a dashed
  sky box (never copied into human fields), and the history.
- **Review actions**: Agree, Adjust, Reject, Request more photos. Each needs a message to the farmer in
  their language (templates in English and Kiswahili) and can ask for a follow-up photo in 3 or 7 days.
  Replies that mention a dose (like `50 ml/20 L`) or a product name are flagged for a second look, not
  blocked (architecture.md §6.4).
- **Overview**: counts for cases needing review, AI cases not yet opened, overdue follow-ups, follow-ups due
  soon and sync failures, then tables for the oldest cases, follow-ups and team load.
- Assign to me, mark as monitoring, close and reopen.

## Not yet

- Data is sample data in `lib/sample.ts`. Reviews are kept in the browser's local storage. With Supabase
  connected, reads go through `@supabase/ssr` on the server and review actions become RPCs that append
  `issue_events` rows; the views become routes (`/overview`, `/issues/[code]`).
- No sign-in, org switcher, SMS or push yet. Photos are drawings; real photos come from Storage through
  signed URLs, and every open is written to the audit log.
- Farms & blocks, Scouting, Tasks, Reports, Team, Knowledge base and Settings show as "Later" in the nav.

## Layout

```
app/            layout, page, tokens (globals.css), dashboard.css
components/     shell (nav, top bar), issues-view, issue-detail, overview, marks, leaf drawings, brand
lib/            types (match the database tables), sample data, store, causes, safety check, formatting
preview/        single-file preview build
```

# ShambaSense farmer app (Phase 1: start, sign in, sign up · Phase 2: first-time questions · Phase 3: main tabs)

Expo SDK 58 (React Native 0.88), Expo Router, TypeScript. Follows `../design.md` v2.0 and `../architecture.md`.

## Screens

| Route | What it does |
|---|---|
| `/` (start) | Forest splash with the lime Contour S (under 1 s), then a 3-slide hero (a line each, on its own slowly drifting background, auto-advancing every 5.5 s, swipe or tap dots), language tiles (Kiswahili first), Create account / I already have an account |
| `/sign-up` | Name (required), county (47-county sheet with search), +254 phone, data-storage consent, Send code |
| `/sign-in` | +254 phone, Send code. Unknown number offers Create an account |
| `/verify` | 6-digit SMS code (Android autofill), resend after 60 s, change number |
| `/onboarding` | Only after a new sign-up: 9 questions, one per screen, then a summary. See below |
| `/home` (tab) | Dark photo hero (sync chip, date, greeting, farm, weather placeholder, 8-week money chart), Today tasks, Season rings, Money by plot, last crop check, 3 recent records |
| `/shamba` (tab) | Dark hero with farm name, size and water chips, and a land-in-use bar (acres per plot against the farm size); plot cards with season progress, last activity and 8-week net; Add plot sheet |
| `/plot/[id]` | One plot: season ring, Add record and Check this plot shortcuts (pre-pick the plot), details, 8-week money, full history |
| `/check` (centre button) | Full-screen flow: framing tips → take photo or choose from gallery → preview (use / retake) → plot, crop, up to 3 symptoms → "Saved on this phone" |
| `/journal` (tab) | Dark hero: this month's sold and spent with a split bar and net, and a 4-week activity grid (one square per day, brighter = more recorded); filters; records grouped by day with each day's net; Add record sheet |
| `/profile` (tab) | Dark hero with farmer card (initial, name, phone, farm) and counts of plots, records and crop checks; language tiles, farm answers, sync state, about, sign out with confirm |

Motion follows design.md §5.6: 200 ms rise-and-fade with 40 ms stagger, 80 ms press scale, 140 ms colour changes, 240 ms sheet. Reanimated `withTiming` only, no springs, reduced motion respected. The logo bands never animate.

## First-time questions (Phase 2)

Shown once, straight after a new account verifies its code. Existing users who sign in skip it.
Nine questions, one per screen, about two minutes. The first four are required; the rest have "Skip for now".

| # | Question | Answer type | Why we ask |
|---|---|---|---|
| 1 | What do you grow? | Multi, 12 crops (maize, beans, potatoes, tomatoes, sukuma wiki, cabbage, onions, bananas, avocado, tea, coffee, something else) | Decides which reviewed guides sync and which crops Crop Check supports for this farmer. Maize (36 % of households) and beans (25 %) lead, per Twaweza's 2020 Sauti za Wananchi brief |
| 2 | How big is your farm? | Under 1 acre, 1–2, 2–5, over 5, not sure | A third of Kenyan farm households farm under one acre (KNBS, 2019 census), so the smallest band comes first. Hint: one acre is about half a football pitch |
| 3 | How many plots do you farm? | One, two, 3–5, more than 5 | Sets up Shamba (farms → plots). Plot names and planting dates are asked when the farmer adds each plot |
| 4 | Where is your farm? | Farm name (pre-filled "Shamba la {first name}"), county (from sign-up), ward or nearest town (optional) | Creates the first `farms` row; ward drives the weather strip |
| 5 | How do your crops get water? | Rain / irrigation / both · skippable | Weather and planting tips differ for rain-fed farms |
| 6 | Do you keep animals? | Multi: cows, goats, sheep, chickens, pigs, bees, no animals · skippable | Manure, feed crops and mixed farming change advice. "No animals" clears the others |
| 7 | Farmer group or co-operative? | Yes (+ optional group name) / no · skippable | Lets a co-op link later (`org_farmer_links`, farmer consent required). Name helps match the invite |
| 8 | What do you want help with? | Multi: check sick crops, records, agronomist, reminders · skippable | Orders what Home shows first |
| 9 | A little about you | Age band (18–24 … 55+, prefer not to say) and gender (woman, man, prefer not to say) · skippable | Programmes report reach to women and youth. Asked last, both optional, never shown to others or in the summary |

**Privacy note.** Kenya's Data Protection Act 2019 lists sex as sensitive personal data. Gender is only stored
when given, with a `consents` row (`kind = sensitive_profile`). Age and gender stay out of org dashboards
until a programme's data-sharing agreement covers them.

Motion: segmented progress bar fills in 240 ms, each question slides 16 px from the side it came from, options
ease their fill in 140 ms with a small tick pop, the header photo crossfades between questions, the group-name
field slides in when "Yes" is picked, and the closing screen draws its check mark. Android back steps back.

**Schema additions** (live mode): `farms.size_band`, `farms.water_source`, `farms.main_crops text[]`,
`farms.plot_count`, `farms.livestock text[]`, `profiles.goals text[]`, `profiles.coop_member bool`,
`profiles.coop_name`, `profiles.age_band`, `profiles.gender`; `user_metadata.onboarded_at` marks completion.

## Main app (Phase 3)

Bottom bar (design.md §7.1): Home, Shamba, a raised forest Check button with a lime camera, Journal, Profile.
The selected tab gets a forest-tint pill (140 ms). Check is a button, not a tab, because it opens its own full-screen flow.

**Offline first and honest.** Everything is written on the phone first (`src/lib/farm-store.tsx`, AsyncStorage,
one store per account) and counts as waiting to send. The sync chip says "Waiting to send · N" with a slow sky pulse,
or "Saved on this phone". It never says "Synced" and is never lime. PowerSync's SQLite and upload queue replace this
store when the backend is up; the record shapes already follow `plots`, `journal_events` and `crop_checks`.

**Crop Check never guesses.** The phone stores the photo (copied into the app's own `checks/` folder so clearing the
camera cache cannot lose it) with the crop, plot and symptoms, and marks it "Waiting to send". The saved screen says
the answer comes from the reviewed library and, if needed, an agronomist. Photos are taken at quality 0.6 to keep
uploads small.

**Home charts** (redesign, 27 Oct). The style follows [bklit](https://bklit.com) (thin monotone lines, soft gradient fill,
dashed grid, rounded rings, legend bars). bklit itself is React web (visx + DOM), so the charts are rebuilt with
react-native-svg in `src/components/charts.tsx`, with no new dependencies:
- *Money, last 8 weeks*: running totals of sold (lime line and fill, allowed because it sits on the dark hero) and spent
  (dashed cream), with the net as the headline. Drag across it for a crosshair and the week's values.
- *Season*: one ring per planted plot (up to 3), filled by days since planting against a typical season
  (`src/lib/crops.ts`, maize 120 days, beans 90, sukuma 60 …), with "about N weeks to harvest". Perennials get no ring.
- *Money by plot*: sold and spent bars per plot, net on the right.
Lines reveal over 900 ms and rings/bars grow over 700 to 800 ms, longer than §5.6's 240 ms because Kalpit asked for a
more premium Home. All of it is instant under reduced motion. Empty farms see a short line pointing to Journal or Shamba.

**Today tasks** come only from what is missing: plots still to add (against the plot count from question 3),
plots without a planting date, no crop check yet, nothing recorded today. When all are done it says "Nothing due today."

**Journal forms** ask only what each kind needs: quantity and unit for inputs, harvest and sale; KES for inputs,
expenses and sales; a note for all. Dates are Today, Yesterday, or DD/MM/YYYY. A record needs at least a note,
quantity or amount. Money out shows as −KES, sales as +KES in forest.

**Sign out** asks first, says how many changes are still waiting, then wipes the farm store and photos on this phone.

**Preview mode** gives the pretend account (+254 712 345 678, Juma) a farm: Shamba la Juma, Njoro, Nakuru, maize,
beans and sukuma wiki, three plots, and about 8 weeks of sample records (`src/lib/preview-seed.ts`, marked as sent)
so the Home charts have data. In live mode the farm answers are read back from `farms` and `profiles` after sign-in.

## Run on your phone with Expo Go

Every module in the app ships inside Expo Go (SDK 58), and the package versions match what Expo Go bundles,
so no development build is needed.

1. Install **Expo Go** from the App Store or Play Store. It must be the SDK 58 version (the current one).
2. On a computer with Node 20 or newer, unzip `shambasense-app.zip` and run:
   ```bash
   cd shambasense-app
   npm install
   npx expo start
   ```
3. Open Expo Go and scan the QR code shown in the terminal. The phone and computer need to be on the same Wi-Fi.
   If they can't be (office or campus networks often block it), use `npx expo start --tunnel` instead.
4. The app starts in preview mode: sign in with 712 345 678 and code 123456, or create an account.

Leave `.env` without Supabase keys for preview mode. With keys, sign-in sends a real SMS.

Other ways to run it:
```bash
npx expo start --web    # quick look in a browser
npx expo run:android    # your own dev build, needed later for release builds
```

**Preview mode.** With no Supabase keys the app sends no SMS and accepts code `123456`.
`+254 712 345 678` is a pretend existing account, so sign-in works with it and sign-up refuses it.

**Live mode.** Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Sign-up calls
`signInWithOtp({ phone, options: { shouldCreateUser: true, data: { display_name, county, language } } })`;
sign-in uses `shouldCreateUser: false`. Supabase's Send SMS Hook (`sms-hook` Edge Function → Africa's Talking)
delivers the code. A database trigger should copy the user metadata into `profiles`.

## Background photos

All three are free under the [Unsplash License](https://unsplash.com/license) (commercial use, no attribution
required; credited here anyway). Cropped to 1080 x 1920 WebP, 50 to 140 KB each, in `assets/images/`.

| File | Used on | Photo |
|---|---|---|
| `slide-farmer.webp` | Start slide 1 | [Soybean farmer in his field](https://unsplash.com/photos/a-farmer-tends-to-his-crops-in-a-green-field-1AoGjqdyDLU), Richard Nyoni, Malawi |
| `slide-seedling.webp` | Start slide 2 | [Seedling with water drops in soil](https://unsplash.com/photos/a-young-plant-sprouts-from-the-ground-TBjNbj1sdAE), Ksenia Pixelesse |
| `slide-tea.webp` | Start slide 3, sign-in and sign-up header | [Tea rows on a hillside](https://unsplash.com/photos/tea-bushes-on-green-hillside-H1RWuPMIgBY), Colin Roe, Cameron Highlands, Malaysia |

Crops keep each subject in the band between the logo and the headline. To swap a photo, keep it portrait
9:16 with the subject in the top 10 to 35 %, and update `FIELD_PHOTOS` in `src/components/field-background.tsx`.

The start screen's drift and crossfade go beyond design.md §5.6 at Kalpit's request (27 Oct). Both stop under reduced motion.

## Layout

```
src/app/            routes (Expo Router)
src/app/(tabs)/     Home, Shamba, Journal, Profile and the custom tab bar
src/components/     brand, buttons, fields, county picker, auth scaffold, motion, sheet, sync chip, record rows, icons
src/i18n/           en + sw strings (Kiswahili needs native-speaker review, design.md §18.5)
src/lib/            auth (Supabase + preview), farm store, photos, dates, money format, phone parsing, counties, secure session storage
src/theme/tokens.ts design tokens from design.md §5
```

When the pnpm/Turborepo monorepo exists this moves to `apps/farmer`, tokens to `packages/ui-tokens`, strings to `packages/i18n`.

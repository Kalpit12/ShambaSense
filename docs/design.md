# ShambaSense Design System

**Product:** ShambaSense, crop intelligence and farm operations for Kenyan smallholders
**Prepared for:** NexFlora Tech, Nairobi
**Audience:** frontend engineers, product designers, agronomy reviewers
**Surfaces:** farmer Android app (Expo + React Native), organisation dashboard (Next.js), marketing site (Next.js)
**Version:** 2.0 · 27 October 2026
**Supersedes:** design.md v1.1 (26 October 2026)
**Status:** reference-locked. If a mockup, component or page disagrees with this file, update this file first.

This file is the visual and interaction source of truth. v2.0 keeps the v1.1 "field instrument" product rules and adds the brand decided on 27 October: the Contour S mark, deep forest + Shamba lime, cream, and the lowercase `shambasense` wordmark. It also records what the marketing site actually shipped.

---

## 0. What changed from v1.1

| Area | v1.1 | v2.0 | Why |
|---|---|---|---|
| Brand mark | Placeholder "leaf-notch on a square plot" | **Contour S**: three lime bands tracing an S on a deep forest tile; two-band version at 24 px and below | Chosen in logo round 3 |
| Wordmark | "ShambaSense" in running text | **`shambasense`**, lowercase, IBM Plex Sans Bold, tracking −3.5 %, outlined | Matches the mark; shipped on the landing page nav and footer |
| Primary green | `forest.700 #1F6B45` (spec) / `#1F5A3A` (landing build) | **`forest.900 #0F3D26`** (brand deep forest) everywhere | One green, not three. White on it is 12.2:1 |
| Lime | Rejected ("lime cartoon agriculture", "Safaricom red + lime") | **Shamba lime `#C4EF5A`** allowed as the brand accent, with strict rules (§4.3) | It is the logo colour. Rules keep it away from the DigiFarm/ShambaSync look |
| Cream | Rejected ("cream canvas + serif") | **Cream `#F4F1E6`** allowed as the text colour on forest and as a brand surface on marketing only | Product canvas stays stone; still no serif |
| Ink | `#14201A` | Product ink stays `#14201A`; brand ink `#0D110E` for the logo and lockups only | Avoids re-tuning every product text pair |
| Typefaces | Plex Sans only (+ Mono for dashboard IDs) | Product unchanged. Marketing adds **Plex Sans Condensed** for display and **Plex Mono** for labels | Already shipped on the landing page |
| Dark mode | "Never default" | Still never default. Marketing site supports dark via `prefers-color-scheme`; primary action becomes lime on dark | Landing page already ships dark |
| Radius | 8 px controls | Product stays 8 px. Marketing uses pill buttons and 14 px cards | Shipped landing style; product keeps field density |
| `stone.600` | Claimed ≥ 7:1 on stone.50 | Measured 6.7:1, so darkened to `#47514B` (7.5:1) | Contrast fix |

Everything else in v1.1 (IA, evidence split, sync chip, honesty rules, motion, field constraints) carries forward unchanged and is restated below so this file stands alone.

---

## 1. Design brief

Designing ShambaSense for Kenyan smallholder farmers, farm teams, agronomists, co-operatives and agricultural programmes.

- **Platforms:** Android-first farmer app; responsive web organisation dashboard; English-only marketing site.
- **Goal:** record the farm, check a crop problem, and follow the issue to a closed action, in English or Kiswahili, with or without signal.
- **Tone:** practical, local, honest about uncertainty. A tool you trust in a plot, not a plant-ID toy and not a US grain dashboard.
- **Main risk:** looking like generic AI, over-claiming a diagnosis, or being unreadable in sunlight on a low-spec phone.
- **Must remember:** evidence split (Observed signs vs Possible causes) and a sync chip that never lies.
- **Constraints:** Expo + React Native; Next.js; Supabase; bilingual Latin script; offline-first; WCAG 2.2 AA; 4"–6.7" Android; organisation tenant isolation.

---

## 2. Reference lock

**Primary direction:** field instrument, signed with the Contour S.

**Preserve**
1. Light, high-contrast stone canvas in the product (sunlight readable).
2. IBM Plex Sans as the only product UI typeface.
3. Deep forest used for primary actions, selected nav and brand surfaces, never as a page wash in the product.
4. Camera as the farmer app's centre action.
5. Photo evidence in every diagnosis and issue row.
6. Lime as a spark on forest or on dark, never as a fill on light.

**Borrow only**
1. Farmer photo | reference photo match layout (iNaturalist Match).
2. Persistent sync chip with queued count (PoultryDesk / RemoteFarm).

**Role rules**
- Forest = primary action, selected state, brand surface.
- Lime = brand accent. Never success, never "synced", never severity.
- Sky = info, weather, waiting to send. Never success.
- Amber / red = severity and safety only.
- Ranked AI causes are candidates, never confirmed diagnoses.
- An offline placeholder is never styled as a completed Crop Check.

**Reject**
- Indigo / violet, purple gradients, Inter.
- Dark mode as the default.
- Serif display type; terracotta brand.
- Lime + red together (Safaricom / DigiFarm); mint-on-lime splash and lime swirl (ShambaSync); full-page green gradients.
- Card grid as the default layout; grocery 6-tab bar; loan card or marketplace as farmer home.
- Confidence percentages without calibration; automatic pesticide product + dose.
- US State / Zip forms; "LOCATION A".
- Stock drone / robot heroes; tractor watermarks instead of plot photos.
- Gradients, glows, bevels or shadows on the logo.

---

## 3. Decision ledger

| Decision | Source | Why |
|---|---|---|
| Light mode default | Android outdoor contrast | Farmers use phones in sun; dark glass fails outdoors |
| Forest on actions only in product | Plantix / iNaturalist, constrained | Agriculture green is earned; flooding it looks generic |
| **Contour S mark** (27 Oct) | Logo round 3, after research on Stripe, Spotify, Airbnb, Robinhood, Monzo, Cash App and agtech identities | Flat, two colours, one idea, fills the tile. Contour lines = hillside and ploughed rows; rare among Kenyan crop apps, which mostly use a green leaf |
| **Forest + lime as brand pair** (27 Oct) | Logo round 3 | High contrast (lime on forest 9.2:1), stands out on a home screen of bright icons |
| **One forest, `#0F3D26`** (27 Oct) | Reconciling v1.1 spec, landing build and logo | Three different greens were in use. The logo green is darkest and passes everywhere |
| **Lowercase `shambasense` wordmark** (27 Oct) | Logo round 3; landing nav and footer | Friendly, compact, sits beside the S without competing |
| IBM Plex Sans | Multilingual product type | Strong Latin/Kiswahili, tabular figures for kg and KES; the wordmark is cut from it too |
| Plex Sans Condensed for marketing display | Landing page build | Large headlines fit on phones without shrinking |
| 5-tab IA with centre camera | iNaturalist / Seek | 5 is the Android max that still fits thumbs |
| Merge Activities into Journal | DigiFarm "clarity is key" | One habit, one ledger |
| Observed vs Possible split | Ada + blueprint AI rules | Stops the UI looking like a diagnosis certificate |
| No % confidence until calibrated | Ada usability research | Self-reported model confidence is not a probability |
| Sync chip on every farmer screen | PoultryDesk / RemoteFarm | Rural connectivity is the product |
| Issue list + detail, not cards | Linear | Org users triage many cases |
| 40 px photo in every issue row | FieldView scouting pins | Agronomists decide from pictures |
| Language before account | DigiFarm USSD | Kiswahili is not a settings afterthought |
| 48×48 dp targets, 18 px farmer body | Material 3 + outdoor a11y | Low-spec screens, gloves, one hand |
| No chemical CTA on result | Blueprint safety gate | An image is not a registered product + label |
| Kenya place names only | ShambaSync / DigiFarm teardown | County · ward · named plot |
| Marketing site English only | 26 Oct homepage decision | Kiswahili lives in the product, not as a site locale |

---

## 4. Brand

### 4.1 The mark: Contour S

Three bands trace an S, like contour lines on a hillside or ploughed rows seen from above. Deep forest tile, lime bands, flat fills, nothing else.

| Asset | When | File |
|---|---|---|
| 3-band mark | Above 24 px | `logo/final/svg/shambasense-mark-{forest,lime,black,white}.svg` |
| 2-band mark | 24 px and below (favicon, small UI) | `logo/final/svg/shambasense-mark-small-*.svg` |
| Icon tile (full bleed) | App stores, launchers (they apply their own mask) | `svg/shambasense-icon.svg`, `png/shambasense-icon-1024.png` |
| Rounded tile | Anywhere a pre-rounded tile is needed (radius 27 % of size) | `svg/shambasense-icon-rounded.svg` |
| Lime tile (inverse) | On dark or forest backgrounds where a forest tile would disappear | `svg/shambasense-icon-lime.svg` |
| Play Store icon | 512 px, 32-bit | `png/play-store-icon-512.png` |
| Android adaptive icon | Background `#0F3D26`, vector foreground, Android 13 monochrome | `logo/final/android/res/` (drop into `app/src/main/res`) |
| Web | `favicon.svg`, `favicon.ico` (16/32/48), apple-touch-icon 180, PWA 192/512 | `logo/final/web/` |

All paths are under `/mnt/project-files/shambasense/`. Everything is also in `logo/shambasense-logo-final.zip`.

**Rules**
- Use the 2-band mark at 24 px and below.
- Clear space: at least one band width around the tile.
- Keep it flat: no gradients, glows, shadows or bevels, and no other colours inside the tile.
- Do not rotate, outline, animate the bands, or put the S in a circle badge.
- The mark never carries status. The sync chip keeps its own status dot (§11); the logo is not a sync indicator.

### 4.2 Wordmark and lockups

- `shambasense`, all lowercase, IBM Plex Sans Bold, tracking −3.5 %, converted to outlines.
- In running text the product is still written **ShambaSense** (capital S twice). The lowercase form is the logo only.
- Lockups: `shambasense-lockup-forest` (light backgrounds), `-on-dark` (dark or forest), `-mono-forest` (one-colour print).
- Gap between tile and wordmark: 10 px at a 28–32 px tile (landing nav), i.e. about one third of the tile.
- Marketing footer may set the wordmark edge to edge (shipped as the "bigmark"). It is decorative there and aria-hidden; the real name is in the footer text.

### 4.3 Brand colours and how they meet the product

| Token | Hex | Role |
|---|---|---|
| `brand.forest` | `#0F3D26` | Logo tile, primary action, brand surfaces |
| `brand.lime` | `#C4EF5A` | Logo bands, accent on forest or dark, primary action in dark mode |
| `brand.cream` | `#F4F1E6` | Text and icons on forest; warm surface on marketing |
| `brand.ink` | `#0D110E` | Logo ink, lockups, text on lime |

**Lime law** (this is what keeps lime from looking like DigiFarm or ShambaSync):
1. Lime sits only on forest, ink or dark surfaces. On light stone or white it is 1.2–1.3:1 and invisible in sun, so never use lime text, lime icons or lime borders on a light background.
2. Lime is never a large fill in the product. Allowed: the FAB camera glyph, the selected-tab indicator bar on a forest tab bar if one is ever used, a highlight underline in marketing, the primary button in dark mode.
3. Lime never means success, synced, healthy or "good result". Those stay words + a quiet check (§5.5).
4. Never put lime next to red as a pair. Never use a lime-to-green gradient.
5. Budget: lime covers under 5 % of any product screen.

**Cream law:** cream is the "white" on forest (10.8:1). The product canvas stays cool stone. Marketing may use cream or warm stone as page ground. No serif ever goes with it.

---

## 5. Design tokens

Implement in `packages/ui-tokens`. Farmer app, dashboard and marketing share colour and type family. They do not share density or radius.

### 5.1 Colour: product (farmer app + dashboard)

Neutrals are cool stone with a faint chlorophyll cast. Not cream. Not pure grey.

| Token | Hex | Role | Notes |
|---|---|---|---|
| `stone.50` | `#F3F4F2` | App / page background | |
| `stone.100` | `#E8EBE6` | Sunken wells, table header, empty photo well | |
| `stone.200` | `#D5DAD3` | Hairline borders, dividers | |
| `stone.300` | `#B7C0B4` | Disabled borders | |
| `stone.500` | `#6B756E` | Placeholder, disabled text only | 4.3:1 on stone.50: never for text the user must read to act |
| `stone.600` | `#47514B` | Secondary text | **changed** from `#4E5852`; 7.5:1 |
| `stone.800` | `#24302A` | Primary text on tinted surfaces | |
| `ink` | `#14201A` | Primary text | 15.2:1 on stone.50 |
| `forest.50` | `#E6EFE8` | Selected row / chip fill | **re-derived** from new forest |
| `forest.100` | `#CFE0D3` | Nav active background | **re-derived**; forest text on it 8.9:1 |
| `forest.900` | `#0F3D26` | Primary button, selected tab, FAB, focus ring | **replaces `forest.700 #1F6B45`**; 11.1:1 on stone.50 |
| `forest.950` | `#0B2E1C` | Pressed primary | **replaces `forest.800`** |
| `on.forest` | `#F4F1E6` | Text / icon on forest (cream) | **changed** from `#FFFFFF`; 10.8:1 (pure white also allowed, 12.2:1) |
| `lime.400` | `#C4EF5A` | FAB camera glyph, brand accent on forest | See lime law |
| `on.lime` | `#0D110E` | Text on lime | 14.4:1 |
| `sky.50` | `#E7F3F8` | Info / weather / waiting-to-send fill | |
| `sky.700` | `#2A6F97` | Info text, weather icon, "Waiting to send" | 5.0:1 |
| `amber.50` | `#FBF0DC` | Warning fill, medium severity | |
| `amber.800` | `#8A5A10` | Warning text | 5.4:1 |
| `red.50` | `#FCEBEA` | Danger fill, high severity | |
| `red.700` | `#B42318` | Errors, destructive, high severity mark | 6.0:1 |
| `on.danger` | `#FFFFFF` | Text on solid red | |

**Retired:** `forest.700 #1F6B45`, `forest.800 #175536`, and the landing build's `--forest #1F5A3A`. Map all three to `forest.900`.

**Usage law:** 60 % stone surfaces, 30 % ink/type, under 10 % forest, under 5 % lime. Amber and red never decorate. Sky and lime never mean success.

**Contrast targets** (WCAG 2.2 AA, prefer AAA for farmer body), all measured:
- ink on stone.50 = 15.2:1
- stone.600 on stone.50 = 7.5:1
- cream on forest.900 = 10.8:1
- lime on forest.900 = 9.2:1 (marks and glyphs only)
- forest.900 on forest.50 = 10.4:1

### 5.2 Colour: marketing site

The landing page (`landing/shambasense-landing.html`) ships warm stone and its own token names. Keep its neutrals; move its greens to the brand.

| Landing token | Current | v2.0 value | Note |
|---|---|---|---|
| `--stone` | `#E7E6DF` | keep | Page ground (forest on it 9.8:1) |
| `--stone-2` | `#DCDBD2` | keep | |
| `--paper` | `#F3F2ED` | keep (or brand cream `#F4F1E6`; visually identical) | Cards, fields |
| `--ink` | `#17201B` | keep | |
| `--ink-2` / `--ink-3` | `#4F5A53` / `#7D867F` | keep; `--ink-3` is meta and the dimmed headline line only | |
| `--forest` | `#1F5A3A` | **`#0F3D26`** | Pending: landing still uses the old green outside the logo |
| `--forest-ink` | `#F3F2ED` | **`#F4F1E6`** | |
| `--forest-soft` | `#D5E1D6` | **`#CFE0D3`** | |
| new `--lime` | — | **`#C4EF5A`** | Highlights on forest blocks (pilot CTA band, footer), underline under "shamba" in the hero only if it sits on forest |
| `--tomato`, `--amber`, `--halo`, `--leaf` | as shipped | keep | Illustration and form-state colours inside phone mockups |

**Marketing dark mode** (`prefers-color-scheme: dark`, overridable with `data-theme`): grounds `#111713 / #18201B / #1B231E`, ink `#E6E5DD`. The primary action becomes **lime `#C4EF5A` with ink `#0D110E` text** (13.7:1 on the dark ground), replacing the shipped `#5FAE7E`. Use the `-on-dark` lockup.

### 5.3 Typography

**Product (farmer + dashboard)**
- Family: IBM Plex Sans. Fallback: `IBMPlexSans, "Noto Sans", system-ui, sans-serif`.
- Load 400 / 500 / 600 only. The wordmark is outlined, so the app does not need Bold.
- IDs, quantities, KES: tabular lining figures (`font-variant-numeric: tabular-nums`).
- Dashboard issue IDs: IBM Plex Mono 12–13 px (`ISS-0142`).
- Kiswahili uses the same family. No display serif.

Farmer app scale (18 px base, readable at arm's length):

| Token | Size / line / weight | Use |
|---|---|---|
| `display` | 28 / 34 / 600 | Screen titles |
| `title` | 22 / 28 / 600 | Section titles |
| `body` | 18 / 26 / 400 | All readable copy |
| `body.emphasis` | 18 / 26 / 600 | Primary buttons, key facts |
| `meta` | 14 / 20 / 500 | Timestamps, sync, chips |
| `label` | 13 / 16 / 600 | Overline; uppercase only for status |

Never ship 11–12 px in the farmer app. Dynamic type must scale to 200 % without clipping primary actions.

Dashboard scale (14 px base):

| Token | Size / line / weight | Use |
|---|---|---|
| `dash.display` | 24 / 32 / 600 | Page titles |
| `dash.title` | 16 / 22 / 600 | Panel titles |
| `dash.body` | 14 / 20 / 400 | UI copy |
| `dash.row` | 14 / 20 / 500 | Issue titles |
| `dash.meta` | 12 / 16 / 500 | IDs, timestamps |
| `dash.mono` | 12 / 16 / 500 | `ISS-0142`, plot codes |

**Marketing site (as shipped)**
- Display: IBM Plex Sans Condensed 600–700, line-height 0.92–1, tracking −0.01 to −0.025 em.
- Body: IBM Plex Sans 400–600, 17 px base, line-height 1.55.
- Labels / kickers: IBM Plex Mono 13 px, uppercase, tracking 0.06 em.
- Scale: `--step--1` 0.8125 rem · `--step-0` 1.0625 rem · `--step-1` 1.25 rem · `--step-2` 1.75 rem · `--step-3` clamp(2, 4.2vw, 3.25) rem · `--step-4` clamp(2.6, 5.9vw, 5.6) rem.
- Condensed and Mono-as-label are marketing only. Do not bring Condensed into the farmer app.

### 5.4 Spacing, radius, elevation

4 px grid.

| Token | Value | Use |
|---|---|---|
| `space.1–8` | 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 | Padding and gaps |
| `screen.gutter` | 16 farmer · 24 dashboard ≥1024 · 16 → 32 marketing ≥720 | Page inset |
| `touch.min` | 48×48 dp | Every interactive farmer control |
| `touch.primary` | 56×56 dp | FAB, primary submit |
| `radius.sm` | 8 | Product inputs, chips, buttons |
| `radius.md` | 12 | Sheets, dialogs, photo wells, camera reticle |
| `radius.full` | 999 | FAB, avatars, sync chip; **all marketing buttons and fields** |
| `radius.card.mkt` | 14 | Marketing cards and blocks |
| `radius.table` | 0 | Dashboard data rows |
| `radius.logo` | 27 % of tile | Rounded logo tile only |
| `border.hairline` | 1 px `stone.200` | Default division |
| `shadow.sheet` | `0 8px 24px rgba(20,32,26,0.12)` | Product sheets only |
| `shadow.none` | none | Lists, pages, tables |

Default is no card shadow. A surface is a card only if it is independently tappable and not a list row. Marketing phone mockups may carry their own device shadow.

### 5.5 Icons and status marks

Phosphor (regular, 24 dp optical) or one custom set. One weight.

Status is shape + colour + word, never colour alone:

| Status | Mark | Word EN / SW |
|---|---|---|
| Synced | quiet ink check | Synced / Imetumwa |
| Queued | filled sky dot + count | Waiting to send / Inasubiri kutumwa |
| Failed | red mark | Needs review / Inahitaji ukaguzi |
| Possible match | amber half-circle | Possible match / Inawezekana |
| Needs more info | sky question | Need another photo / Piga picha nyingine |
| Unsupported | stone slash | Crop not supported yet / Zao bado halijaungwa |
| Expert review | forest person | Sent to agronomist / Imepelekwa kwa mtaalamu |

No status uses lime.

### 5.6 Motion

Motion is feedback, not decoration. Every animation confirms a press, shows where a screen went, or calls attention to a status change. Otherwise cut it.

**Product** (farmer app and low-spec Android stay under 240 ms; opacity and 6–12 px translation; never bounce, overshoot, blur or animate gradients):

| Token | Duration | Easing | Amplitude | Use |
|---|---|---|---|---|
| `motion.press` | 80 ms | ease-out | scale 0.98 (0.94 shutter/FAB) | Buttons, chips, rows, tabs |
| `motion.color` | 140 ms | ease-out | — | Selected chip, tab ink, language tile |
| `motion.fade` | 140 ms | ease-out | opacity | Toasts, coach chip, "Why this result?" |
| `motion.enter` | 200 ms | cubic-bezier(0.2, 0.8, 0.2, 1) | 6 px, opacity 0.92 → 1 | Screen enter; never fade from 0 |
| `motion.sheet` | 240 ms | cubic-bezier(0.2, 0.8, 0.2, 1) | from bottom | Journal add, farm switcher |
| `motion.shutter` | 160 ms | ease-out | white 70 % → 0 | Camera capture only |
| `motion.pulse` | 1800 ms loop | ease-in-out | opacity 1 → 0.35 on a 7 px sky dot | Queued sync chip dot only |
| `motion.none` | 0 | — | — | Live org issue-list updates |

Crop Check result: evidence split fades in together, then the status chip, then causes (40 ms stagger, max 3 steps). Expo: Reanimated `withTiming` only; default spring forbidden. No BounceIn, ZoomIn, Lottie loops or shared-element morphs between camera and result.

**Marketing** (as shipped; allowed because it is not a field tool): headline word rise 0.9 s, hero underline draw 1.1 s, phone float 7 s, drifting contour canvas behind the hero, footer wordmark rise 1.2 s, amber live-dot pulse 2.4 s. All of it must stop under `prefers-reduced-motion: reduce`.

**Reduced motion everywhere:** keep colour changes and press opacity; drop translation, scale, pulse, shutter flash, sheet slide. Haptics stay (light impact on shutter and on local save).

**Forbidden:** confetti, mascots, skeleton shimmer, glass/blur transitions in the product, parallax, animated gradients, motion over 500 ms in the product, filling confidence gauges, animating remote dashboard rows, animating the logo bands.

---

## 6. Voice

| Do | Don't |
|---|---|
| "This photo shows yellowing on older leaves." | "Our AI is 94% sure this is nitrogen deficiency." |
| "Possible match. An agronomist should confirm before spraying." | "Heal your crop now." |
| "Saved on this phone. 3 records waiting to send." | A quiet cloud icon with no words |
| "Not enough information — get expert help." | A spinner that eventually invents a pest |
| "Habari, Juma · Green Valley" | "Good afternoon, Farmer" |

English and Kiswahili carry the same meaning. Design every button and chip for Kiswahili length + 40 %.

**Marketing copy (locked):** hero "Signal can wait. The plot cannot." Kicker "NexFlora Tech · Kenya" / "Android · English & Kiswahili · Works with no signal". Promises: if the model is unsure, it says so; a plot tool, not a shop or a loan wallet; it does not replace an agronomist and will not invent a pesticide dose.

---

## 7. Field constraints (non-negotiable)

1. **Sunlight:** test Home, camera and result outdoors at 30 % brightness. If a label disappears, it fails. Lime on light surfaces fails this by definition.
2. **Thumbs:** bottom nav and FAB in the right-thumb zone; destructive actions are not.
3. **One-handed capture:** shutter 72 dp bottom-centre; flip and flash 48 dp.
4. **Low-spec:** no blur backdrops, live gradients or auto-playing video in the product.
5. **Gloves / wet hands:** 8 dp minimum gap between targets.
6. **4-inch devices:** result stacks vertically; two-pane only ≥ 360 dp.
7. **Screen readers:** every image's alt says the crop and what is visible. Sync chip is a live region. The logo's alt is "ShambaSense".
8. **Font scale Extra Large** stays usable.
9. **Colour is never the only signal.** Severity always includes a word.
10. **Account switch** wipes or re-keys local SQLite and the photo cache.

---

## 8. Information architecture

### 8.1 Farmer app: 5 destinations

```
[ Home ]   [ Shamba ]   [ ◎ Check ]   [ Journal ]   [ Profile ]
```

Centre tab is a raised 56 dp forest FAB with a **lime camera glyph**. Label: Check / Angalia.

| Tab | Job | Primary CTA |
|---|---|---|
| Home | What needs me today? | Check crop / today's tasks |
| Shamba | Farms, plots, crop cycles | Add plot / crop cycle |
| Check | Capture → assess → save | Shutter |
| Journal | What happened on this land | Add record |
| Profile | Language, sync, account, legal | Language, sign out, delete data |

Home, top to bottom: sync chip, greeting + farm switcher, weather strip (source + time), Today (0–3 tasks), open issues, last Crop Check, one reviewed guide. No carousel.

**Where the brand appears in the app:** launcher icon, splash (forest ground, lime 3-band mark centred, no wordmark animation, under 1 s), language screen header (small lockup), Profile → About. Nowhere else. The app's screens are a tool, not a billboard.

### 8.2 Organisation dashboard

Left nav 240 px, light: Overview · Farms & blocks · Scouting · **Crop issues** (agronomist default) · Tasks · Reports · Team · Knowledge base · Settings. Top bar: org switcher, farm filter, search, sync/health, user menu. 2-band mark + wordmark top-left of the nav.

| Width | Layout |
|---|---|
| < 768 | Stacked; nav as drawer |
| 768–1279 | Nav + list; detail as overlay |
| ≥ 1280 | Nav + list + detail pane (360–420 px) |
| ≥ 1440 | Optional map pane for Farms & blocks |

### 8.3 Marketing site (shipped sections)

1. Sticky nav: tile + `shambasense` wordmark, links, pill CTA. Blurred stone bar is allowed here only.
2. Hero: condensed headline left, live phone loop right over drifting plot contours; +254 SMS waitlist field.
3. How it works: take a photo → honest answer → real agronomist → close it in your journal.
4. Inside the app: 5 screens (language, Home, Shamba, "Not sure" check, Journal sale).
5. Offline first.
6. Made for the shamba: Kiswahili, named plots, journal, readable in sun.
7. Our promises (what ShambaSense will never do).
8. For co-ops, NGOs and agribusiness: issue queue in browser chrome.
9. Pilot band "Be the first in your county.": forest block, cream text, white fields. Same in light and dark.
10. Footer with edge-to-edge `shambasense` bigmark.

English only. No EN/SW toggle on the site.

---

## 9. Farmer app screens

**Onboarding (language before account):** language tiles (English / Kiswahili, full width, 72 dp, example sentence) → phone sign-in with visible +254 → optional name → first farm (name, county, ward, optional GPS) → first plot (name, crop, planting date) → permission primers one at a time.

**Crop Check capture:** full-screen preview; 12 px reticle at 80 % width, "Fill with the damaged part / Jaza sehemu iliyoharibika"; one coaching chip at a time; gallery 48 dp · shutter 72 dp forest · flash. Freeze frame + Use photo / Retake. Short context sheet (what, crop, up to 3 symptoms) with Continue after the last option. Offline: save locally and say "Cloud check is waiting for signal. Your photo is saved on this phone." Never invent a local diagnosis.

**Crop Check result (signature screen):** Evidence split (farmer photo "What we see / Tulichoona" | reference "Similar case / Mfano unaofanana"), state chip (not a %), Observed, Possible causes with likelihood words, "This is not a confirmed diagnosis.", next steps from reviewed docs, Ask agronomist, Save to journal, "Why this result?" expanding in place. If the model abstains, the reference pane becomes a retake prompt. If the safety gate fails, product names are absent, not greyed out.

| Internal state | EN | SW |
|---|---|---|
| `possible_match` | More likely / Possible | Inawezekana zaidi / Inawezekana |
| `needs_more_information` | Need another photo | Piga picha nyingine |
| `expert_review_required` | Needs an agronomist | Inahitaji mtaalamu |
| `unsupported_crop` | This crop is not supported yet | Zao hili bado halijaungwa |

**Journal:** one ledger, chips All · Work · Inputs · Expense · Harvest · Sale · Checks. Immutable events; corrections add a new event. Add record = bottom sheet with 4 big actions, then the form; numeric keypad + unit picker (kg, g, L, bags, KES).

**Shamba:** Farms → Plots → Crop cycle; stacked list, not a map in MVP; units always shown.

**Profile:** language (instant), sync queue, notifications, offline guides, privacy / deletion / version, sign out (confirm; clears local cache).

---

## 10. Organisation dashboard screens

- **Overview:** widget row (open issues by severity, tasks due, overdue follow-ups, sync failures, AI cases waiting for review). Tables and lists, not doughnuts.
- **Crop issues:** ~48 px rows: Photo 40 · ID · Crop · plot · Title · Severity · Status · Assignee · Updated. Selected row = `forest.50`. Severity = word + mark. Detail pane: gallery, evidence split, observed / causes / citations, review actions Agree / Adjust / Reject / Request more photos, activity, task composer. AI suggestions are dashed sky, never written into human fields.
- **Scouting / Tasks:** pins = photo + note + severity + plot. Open → In progress → Blocked → Done. Overdue = `amber.50` row.
- **Reports / Team / Knowledge / Settings:** filters + table + CSV; roles matrix; documents with crop, region, version, reviewer, date.

---

## 11. Components

Build once in `packages/ui-tokens` + app primitives.

| Component | Notes |
|---|---|
| Button | Product: primary forest/cream, secondary hairline, tertiary text, danger. 48 farmer / 36 dashboard, radius 8. Marketing: pill, 48–52 min height. Dark marketing primary = lime/ink |
| Chip | Filter or status, 32–40 high; Kiswahili must not truncate on primary chips |
| StatusMark | Shape + colour + word |
| SyncChip | synced · queued(n) · needs review(n) · offline. Sky dot, never lime, never the logo |
| EvidenceSplit | Shared mobile / web |
| CauseList | Ranked candidates with likelihood words |
| SafetyBanner | "Not a confirmed diagnosis." |
| PhotoWell | 1:1, radius 12, private, broken-image state; empty = stone.100 + "Add photo" |
| EmptyState | One sentence + one CTA. No mascot |
| UnitInput | Number + unit |
| BrandMark | Picks 3-band or 2-band by rendered size; forest, lime, black, white variants |
| TabBar / CameraCoach / RecordSheet / FarmSwitcher | Farmer only |
| IssueRow / FilterBar / DetailPane / ReviewActions / AuditLine | Dashboard only |

---

## 12. Offline and sync UI

| State | Chip | Record row |
|---|---|---|
| Offline, nothing queued | Offline · saved on this phone | Normal |
| Queued | Waiting to send · 3 | Sky meta "Waiting to send" |
| Uploading | Sending 2 of 3… | Progress on media only |
| Synced | Collapses to last-sync time | No badge |
| Needs review | Needs review · 1 | Red meta |

Pending never uses a green check (or a lime one). AI results never look confirmed while pending. Retries read "Sending again". Sign-out warns "This will remove farm photos stored on this phone."

---

## 13. Bilingual UI

Strings in `packages/i18n` per namespace (`home`, `check`, `journal`, `org`). Recompute layout on switch. Scientific names stay Latin with a local explanation (*Alternaria solani* · Early blight · Kuoza kwa majani). Dates `26 Oct 2026 / 26 Okt 2026`; Today / Leo, Yesterday / Jana. No generic LLM translation of agronomy content in the UI.

---

## 14. Photography and media

Full-bleed capture with no filter; two 1:1 wells on results; 40–56 dp thumbs in lists; strip EXIF location unless the user opted in. Marketing art direction: real Kenyan plots, hands, tomatoes / maize / kales, overcast or hard noon light. No stock European greenhouse, no illustrated crops, no drones. Marketing phone mockups may use the simplified leaf/lesion illustration colours already on the landing page.

---

## 15. States

Every screen in four states: populated, empty, loading, error. Empty Home: "Add your first plot, then check a crop." Loading AI: photo stays, "Checking a reviewed library for this crop…" with abort. Network error: "No signal. Photo saved on this phone." Camera denied: Settings instructions + "Choose from gallery".

---

## 16. Engineering notes

- Tokens as one JSON source → CSS variables (web) and an RN theme object.
- Fonts: product loads Plex Sans 400/500/600 (+ Mono on dashboard). Marketing loads Sans 400–700, Sans Condensed 500–700, Mono 400–500.
- Focus: `:focus-visible` 2 px forest ring, 2 px offset in product; 3 px / 3 px on marketing. On forest or dark surfaces, the ring is lime.
- Expo Router tabs; centre tab opens the camera stack. FlashList for rows. `expo-image` with disk cache.
- Android icon: copy `logo/final/android/res/` into `app/src/main/res`; adaptive background colour `#0F3D26`.
- Web: `favicon.svg` first, `favicon.ico` fallback, `apple-touch-icon.png`, manifest icons 192 / 512, `theme-color` `#0F3D26`.
- Feature flag: chemical recommendations hidden until the safety gate passes.
- QA: a 4–5" entry Android (Tecno/Itel class), a mid Samsung, web at 1280 and 1440; outdoor pass; Kiswahili pass; font scale XL; airplane-mode queue test.

---

## 17. What this system refuses

- Universal "any plant, instant cure" chrome; confidence %, gauges or dot metres.
- Image-based NPK / pH / soil scores; auto-filled pesticide dose, mixing or PHI.
- Paywalls in the farmer MVP; dark glass dashboards; Inter / indigo / purple gradients; mascots.
- Card grids of farms as the default org view; hiding sync failure; English-only product screens.
- Lime text on light backgrounds; lime as success; lime + red; lime-to-green gradients.
- Logo gradients, glows, shadows, extra colours, or the logo used as a status icon.
- ShambaSync mint splash, lime swirl, grocery tabs, % OFF; DigiFarm red + lime wordmark, green gradient splash, loan wallet home.
- US State / City / Zip; "LOCATION A"; drone / robot heroes; tractor watermarks; "Farmer" with no name.

---

## 18. Open items

1. **Landing page colours:** move `--forest` from `#1F5A3A` to `#0F3D26`, add `--lime`, and switch the dark-mode primary to lime when the page moves into Next.js. Add the favicon set at the same time.
2. **Token JSON** in `packages/ui-tokens` from §5.
3. **Coded prototype** of Home, Camera, Result, Sync queue (farmer) and Crop issues list + detail (org) using the v2.0 tokens.
4. **Outdoor test** of the forest FAB with lime glyph and of `stone.600` secondary text on a low-spec Android.
5. **Kiswahili string review** with a native speaker before UI freeze.
6. **Not yet designed** (from the competitive field map, not yet adopted): 3-day follow-up photo, SMS issue updates, shareable farm record export, low-data mode, Kiswahili voice notes. Each needs a decision before it gets screens here.

The product looks right when a farmer in a tomato plot can take a photo with one hand, understand that the app is unsure, save the case without signal, and an agronomist later sees the same photo beside a reviewed reference. The brand looks right when the Contour S is the only loud thing on the screen, and only on the home screen.

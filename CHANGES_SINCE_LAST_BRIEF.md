# Changes since the last brief (read this first; overrides README.md)

## LOCKED: graphics are final
Build **everything** for real, and keep the graphics **exactly** as in `design/`. See **DESIGN_LOCK.md**.


## 0. NEW, most important: these are fakes in the prototype and must be built for real
Read **docs/09_REAL_SYSTEMS_TO_BUILD.md**. The prototype only *simulates* these in one browser:
- **personal links** (+ short links, link previews, WhatsApp share)
- **SMS automation** (cron, sending, replies)
- **seating chart** (saved to the server, multi-device)
- **guest photo uploads**
- **photo album**
- **video uploads** (parking video)
- **music, hero and plan uploads**

All of it must work on **phones and desktop** (iPhone Safari, Android Chrome, desktop browsers), with touch and mouse, from 360 px up.


## 0b. NEW: customisation and per-guest visibility
- The gift registry (multiple links), **gift account / wishing-well details**, countdown, every section and every link are editable in the admin, with show/hide and reorder. See docs/09 §I.
- **Not invited to the 30th means every 30th mention is hidden**, filtered on the server. Unidentified visitors see only shared content until they look themselves up. See docs/09 §J.
- The prototype now does this too: the 30th section and FAQ group are hidden unless the guest is known and invited, and the gift account card shows when filled in.

## 0c. NEW: contact email and 30th FAQ
- The couple's contact email is **sophienickwedding@outlook.com.au**. It appears in the invitation FAQ (RSVP and contact), as the backup RSVP email, and in the guide's contacts (as a mailto link). The email is editable in the admin.
- The **Nicholas's 30th FAQ group** moves to the **bottom of the FAQ**, in its own blue panel matching the 30th section (`#e7eef8` background, `#2f4d7a` ink, `#3d5f92` accents). It is hidden entirely for guests not invited to the 30th, and for unidentified visitors (docs/09 §J).

## 0d. NEW: RSVP must be very simple
- **One screen, plain questions, big buttons.** "Can you come to the wedding?" and "Can you come to Nicholas's 30th?", answered with **Yes, I'll be there** / **Sorry, can't make it**. Only show the events the guest is invited to.
- Follow-up questions **only appear when relevant**:
  - "How many of you are coming?" (stepper, 1..seats held, default = everyone on the invitation) and "Any dietary needs? (optional)" appear only after a Yes. Dietary is per person, by name.
  - "Will you join the horse ride?" appears only after a Yes to the 30th.
  - "A note for us (optional)".
- Arriving from a personal link means **no name lookup**: the guest's names already show ("Hi Margaret and Peter").
- One "Send RSVP" button. A clear thank-you with a summary and "Change my answer". Must be completable in under 30 seconds on a phone. Large tap targets, no dropdowns where buttons work, and a sticky Send button on mobile.
- **Horse ride note** (RSVP ride question, 30th section, dress code, night-before 30th SMS): *bring water and some food or snacks for the ride*.

## 0y. Latest (owner-approved direction)
- **30th night-before guide is redesigned as "classy country"** to match the invitation, with a layout deliberately different from the wedding guide. LOCKED.
  - Palette: navy `#2f3d5c`, gold `#c8a46a`, cream paper `#f8f3e8` with a faint dot grain. Fonts: Cormorant, Pinyon Script and DM Sans only (no western fonts).
  - **Blue-led** (owner: "lean more into the blue"). Page `#f3f6fb` with a blue dot grain, outside `#dfe7f3`. Hero: a deep blue arch `#2f4d7a` with a soft light glow and a gold dashed inner border. Inside: the date in gold, a giant hairline outlined **"30"** (Cormorant 300, `#c9d8ee` stroke), "Tomorrow" in cream Pinyon Script across it, a gold-ruled "Nicholas turns thirty", the valley photo pill strip with a blue + gold ring, and the greeting in `#e7eef8`. Plan card, weather pill and contacts use `#e7eef8` / `#9fb3d1`; packing panel `#d5e1f1`; closing arch `#2f4d7a`. Gold `#c8a46a` stays as the accent.
  - Then:
    2. a notched "your plan" pass card (personal to the ride answer: arrive by / ride / picnic, plus directions)
    3. a pill-shaped weather strip
    4. a dotted vertical timeline for "The day"
    5. a blue arched "What to bring" **tap-to-check packing list** (saved per guest)
    6. getting home
    7. a double-ruled contacts box
    8. a navy closing arch, "Happy trails"
  - Everything is still editable via Admin → Guest pages → Night before: 30th.
- **Invitation theme fix**: the page background around and between sections follows the theme (`--pgbg`, `--pgbg2`). Pink only in Bridgerton Blush.
- **FAQ**:
  - Wollongong: allow **3 hours**, leave by 10:30am.
  - New "Flying into Sydney Airport?" (~110 km, allow 2 h):
    - hire car route
    - train to Gosford + pre-booked taxi
    - private transfer
    - land by 10:30am or fly in the day before

## 0z. OFFLINE ACCESS (Claude Code MUST build)
- Guest invitations, both night-before guides and the photo upload page must work **offline** once opened (venue reception is patchy).
- Implement:
  - an **installable PWA**: manifest, icons, "Add to Home Screen" prompt on the invite and guide
  - a **service worker** (Workbox) that precaches the app shell, fonts, theme assets, hero photos and parking video poster
  - a stale-while-revalidate cache for each guest's personal data (`/api/guest/:token`, guide JSON, seating, menu, weather cache)
- On first open, also cache the guest's night-before guide data when it unlocks.
- **Offline behaviour**:
  - pages render from cache, with a small "Offline: showing saved details" note
  - RSVP and photo uploads are **queued** in IndexedDB (Background Sync, plus a retry on reconnect for iOS) and sent automatically when back online, with a "Will send when you're back online" confirmation
  - tap-to-call and the saved map/directions still work
- The parking video is cached for offline playback, capped at ~25 MB (else the poster plus a "needs connection" note).
- **Tests**:
  - Playwright with `context.setOffline(true)` after first load: every guest page renders
  - an RSVP is queued and syncs after reconnect
  - an upload is queued and syncs
  - iOS Safari home-screen mode
  - Lighthouse PWA checks pass

## 0x. NEW: night-before guide for the 30th (`design/Night Before 30th.dc.html`, LOCKED)
- Route `/tomorrow-30th/?g=TOKEN`. Sent with the night-before 30th SMS at **5:00pm on 19 Nov 2027** via the new `{guide30}` merge tag.
- Personalised by the guest's ride answer:
  - **Riding**: "Be at the stables by 9:30am" (30 min early: check-in, waiver, helmet)
  - **Not riding**: "Meet us by the river at 12:00pm"
  - **Not sure**: both
- Sections:
  1. Hero (Arrive by / Ride / Picnic)
  2. Weather (same auto BOM/Open-Meteo system, 30th time slots)
  3. Your plan + directions to the stables
  4. The day (run sheet)
  5. What to bring (navy panel: water, food/snacks, long pants, closed shoes, hat, sunscreen, swimmers)
  6. Getting there & home (taxis)
  7. Contacts
- Blue palette matching the invite's 30th section (`#2f3d5c`, `#2f4d7a`, `#3d5f92`, `#e7eef8`).
- Only invited 30th guests can open it (server-checked). The admin has a "Night before: 30th" page in Guest pages with "Every word" editing (`content.texts.guide30`).
- **Hero photo**: `design/assets/valley-30th.png` (the green valley photo the owner supplied). It can be replaced in the admin.
- **Fully driven by the admin** (Guest pages → Night before: 30th):
  1. Photo + key times (date, arrive-by, ride, picnic time/place, dress, directions + BOM links, where-to-go text, transport, closing line)
  2. The day (run sheet)
  3. What to bring (list)
  4. Contacts
  5. Every word
  - Stored as `content.g30`. The guide updates live.
- Generic build: **one night-before guide per event**, generated from that event's settings.

## 0w. Every word customisable + admin name + Wollongong FAQ + 5pm guide
- **Admin name**: "Name shown in this admin (sidebar)" field in Guest pages (`content.adminName`).
- **Every word on the invitation and night-before guide is editable**: Guest pages → last step, "Every word on this page".
  - **Load wording** scans the live preview and lists every piece of text, with search, an edit box per item, Reset, and an "N changed" count. Stored as `content.texts[page][original] = replacement`.
  - The prototype applies these by text-node replacement.
  - **Real build**: every guest-facing string must be a key in the content schema (i18n-style message catalogue per tenant). The admin edits the catalogue, and the pages render from it (no DOM patching). Seed the catalogue from the design files' exact wording.
- **Night-before guide SMS goes out at 5:00pm** the night before each event (wedding 17 Nov 2027, 5pm; 30th 19 Nov 2027, 5pm). The guide unlocks at the same time. Editable.
- **FAQ "Driving from Wollongong?"**:
  - about 2 hours / ~170 km; allow 2.5 h on a Thursday
  - route: M1 Princes Mwy → M5 west → M7 north → M2 east → NorthConnex → M1 Pacific Mwy north → Calga exit (Peats Ridge Rd) → Cooks Road
  - tolls; check Live Traffic NSW

## 0v. Scroll cue over dark sections (bug fixed)
- The floating "Scroll for details" pill must switch to its dark style over the navy 30th section (`#2f3d5c`) and photos, and back to cream over light panels.
- Sample the background on scroll **and** on a 350 ms interval, because iOS momentum scrolling throttles scroll events.
- Dark style: `rgba(246,240,226,.16)` fill, cream text, `rgba(246,240,226,.8)` border, blur 6px.
- Add a Playwright test asserting the pill style per section.

## 0t. Horse ride: arrive 30 minutes early
- Riders arrive by **9:30am**, 30 minutes before the 10:00am ride, to check in, sign the waiver and get fitted for a helmet.
- Shown in: the 30th section (ride card + "Ride with us" step), the RSVP ride note, and the night-before 30th SMS.
- Generic field: event activity `arriveEarlyMinutes` (docs/13).

## 0u. SELLABLE ADMIN (important)
- The admin must be sellable to any couple, who customise it for their own wedding. Read **docs/13_SELLABLE_ADMIN.md**:
  - no hard-coded couple content
  - generic events + an activity add-on
  - Stripe plans, multi-tenant safety, super-admin
  - launch checklist
  - a "stranger couple" E2E test

## 0s. Guests tab filters
- Under search + status pills, a row of filter dropdowns (combined with AND):
  - **Invited to** (any / wedding only / 30th only / both)
  - **Dietary** (has needs / serious allergy / set menu)
  - **Seating** (seated / not seated)
  - **Mobile** (has / none)
  - **Invitation size** (1 / couples / 3+)
  - **Sort** (A–Z, Z–A, latest reply, by table)
- An active filter gets a dark border + bold text. A count shows "N of M invitations", plus **Clear filters**.
- Real build:
  - persist filters in the URL query (shareable, survives reload)
  - filter on the server for large lists
  - saved filter presets in Advanced mode
  - bulk actions on the filtered set (text them, export them, set table)

## 0r. Guest pages tab is laid out as numbered steps (like SMS setup)
- **Invitation**: 1 Look and feel, 2 Names, date and links.
- **Night-before guide**: 1 Arrival and parking, 2 Run sheet, 3 Menu, 4 Contacts on the day.
- Each step has a Cormorant numeral in `#8a5a45`, a title and a one-line hint, the same pattern as the SMS setup list. Advanced settings (docs/10) continue as further numbered steps.

## 0q. Set menu is the default
- Anyone **without dietary requirements automatically gets the set menu** for every course. If nobody has dietary needs, everyone is on the set menu and the Dietary tab says there's nothing to do.
- Exports show "Set menu" (not blank, "Standard" or "Alternate drop") for every course without a special meal. The Dietary tab shows an "Everyone else · N guests · Set menu" row.
- The guide shows "Set menu" on the place card.

## 0p. Text on photos + studio in the admin + quality bar
- The filter studio adds **text on photos** (presets incl. "Sophie & Nick's wedding"; font, position, colour, size). Exported in filters.json `text`. Guests can edit the text in the upload editor.
- The studio is embedded in **Admin → Photos → Filters & frames**.
- **docs/12_QUALITY_AND_STRESS_TESTING.md is mandatory**: flawless, constantly stress-tested.

## 0o. Photo Filter Studio (filters + frames designed here)
- `design/Photo Filter Studio.dc.html` holds 7 filters and 8 frames: None, Polaroid, Gold Line, Sage Mat, Arch, Postcard, Wax Seal, Evening.
- The owner tunes them and exports **filters.json**. Claude Code loads it, builds the same studio into the admin, and renders the filters and frames identically on the canvas. See **docs/11**.

## 0n. Seating save + photo album in the admin
- **Seating**: the **Save seating** button writes to the server immediately (not only autosave), shows "Saved 18 Nov, 3:42pm" next to it, and keeps a local backup copy. In the real build, save to D1 with version history (last 20 saves, restore). It must persist across devices and reloads.
- **Photos tab**:
  - Guest uploads from any phone or browser appear in the admin automatically (polls every 20 s while open; in the real build, also push via the uploads list API).
  - New photos get a **New** badge. Each photo has Save; tap to select several.
  - **Download all (.zip)** and **Download N selected**. The zip contains the originals, named "Guest name date.jpg".
  - In the real build, the Worker streams the zip from R2 (`GET /api/photos/zip?ids=`), so big albums work on phones too. Edited copies go in an `edited/` subfolder.

## 0m. Latest fixes
- **30th visibility (corrects §0b):** show the 30th section and FAQ to everyone **except identified guests not invited**. Unidentified visitors see it.
- **Scroll for details:** only one at a time. The floating pill appears after the hero and adapts its colours to the background behind it (light vs dark/photo).
- **Weather:** above "Finding the ceremony", condensed, with ruled spacing.

## 0l. Advanced admin, simple setup (NEW, important)
- Everything is customisable in the admin, with no code changes: events, RSVP question builder, FAQ, sections on/off + order, wording, theme, SMS templates + schedule + automations, seating, exports, roles, custom domain.
- **Simple mode by default**, plus a 6-step setup wizard (~10 min). An **Advanced** toggle reveals the rest in place.
- Live preview, autosave, undo, version history, draft/publish.
- Full spec: **docs/10_ADMIN_ADVANCED.md**. Visuals stay locked.

## 0k. Local cab company
- **Central Coast Taxis: 02 4337 3999** (direct bookings, maxi taxis for up to 11), or 13 10 08. Tap-to-call links.
- Shown in the invitation FAQ (train/taxi + getting home) and in the night-before guide (transport text + "On the day, call" contacts).
- Admin-editable as a `transport_contacts` list per wedding.

## 0j. NEW: weather forecast on the night-before guide
- A themed "The forecast" section with time slots matching the run sheet, a smart tip and a BOM link. It updates automatically (cached by cron; BOM first, with Open-Meteo as a free fallback).
- It raises a rain alert in the admin "Needs you" list. Full spec in docs/09 §K.

## 0i. NEW: photo filters and frames, upload from phone or website
- Guests can add **filters** (Valley Warm, Sage, Film, Black & White, Soft, Golden Hour) and **frames** (Polaroid with names and date, Gold Line, Sage Mat, Monogram Seal, Postcard) before uploading, plus crop and rotate.
- It must work on phones (camera or library) and on computers (drag-drop or picker).
- Both the edited copy and the original are stored.
- Full spec in docs/09 §D2. The editor UI uses the locked palette and fonts only.

## 0h. Never show the envelope again once it's been opened
- After the first open, remember it per invitation token (localStorage, 90 days). Also record `opened_at` on the server, which shows as "Opened invitation" in the admin.
- On any reload (iOS discarding the tab, a timeout, coming back from another app, tapping the SMS link again), **skip straight to the open invitation** and restore the scroll position. There is no auto-music, because it needs a tap; show the play button.
- The envelope shows only on the first visit, or via a small "Replay envelope" link in the footer.

## 0e. Music plays once
- Invitation music plays **once** from the envelope tap, then stays quiet. No looping. The play/mute button lets a guest replay it.

## 0f. Subtle paper texture around the invitation
- The scrolling invitation background (behind and between the section cards) has a faint paper grain plus fibre layers, on top of the existing dot and crosshatch pattern. Grain opacity ~0.07, fibres ~0.05. Keep it subtle.

## 0g. NEW: the admin must be fully built, using the design's visual language
The admin in `design/RSVP Admin.dc.html` is the **visual spec for every admin screen**. Rebuild **all** of it in React, with nothing left as a placeholder. Match its look exactly:
- **Shell**: 236 px sidebar `#33402f` with "Sophie & Nicholas" in Pinyon Script 30 px, the "RSVP admin" eyebrow, nav buttons with count badges, and event dates plus days-to-go in the sidebar footer. Under 760 px the sidebar becomes a sticky top bar with swipeable nav pills.
- **Page header** on every tab: eyebrow (11 px, 600, .22em, uppercase, `#5b6a52`), then an H1 in Cormorant Garamond 40 px (`clamp(32px,6vw,46px)` on Overview), then actions as pills on the right.
- **Sections**: a 2 px `#33402f` top rule + 18 px padding. **No boxed card grids.** Lists use 1 px `#e2d7bc` / `#ece3cc` row dividers. Row hover `#f1e9d6` / `#f3ecdc`.
- **Buttons**:
  - primary pill: `#5d6b47` fill, `#fbf8f2` text, radius 999, 10×18 padding, 14 px/500
  - secondary pill: 1 px `#c6b794` border, transparent, hover `#efe7d3`
  - dashed "+ Add" pills: `#8a9670`
- **Inputs**: 1 px `#d3c6a4`, radius 8–10, bg `#fff` / `#fbf8f2`, focus outline 2 px `#8a9670`.
- **Status pills**: green `#dfe5cc`/`#3d4a2f`, amber `#f1e7c9`/`#5e5130`, neutral `#ece8d3`/`#46543a`, serious `#8a5a45` with white text.
- **Big figures**: Cormorant 52–54 px.
- **Toast**: bottom centre, `#33402f` pill.
- **Drawer**: right side, 480 px, with a dimmed backdrop `rgba(51,64,47,.32)`.

**Every tab, fully working**:
1. Overview
2. Guests (+ drawer)
3. Dietary (+ meals, venue/caterer exports)
4. Texts (timeline, editor, inbox)
5. Seating designer
6. Photos
7. Guest pages (content editor + live phone preview)
8. Settings (SMS, website, backup/restore, pause all, passcode)
9. Onboarding wizard for new couples (same visual language)

Copy, labels and empty states are taken from the design file verbatim unless docs say otherwise. When in doubt, open the design file in a browser, switch to that tab and match it. Screenshot-compare at 1280×800 and 375×812.

## 1. Stack and budget: NEW
- **A$150 total budget.** Use the **Cloudflare free tier** (Workers + Hono, Pages + Vite React, D1 + Drizzle, R2, Cron). See docs/01.
- README.md still mentions Next.js/Vercel. Ignore that.
- No Google Sheets anywhere. Everything is built in.

## 2. Seating: UPDATED (and bugs found in the prototype; build these right)
- Table types: **Round** and **Long banquet** (across or up-down, length %, up to 60 seats).
  - Picking a type **with a table selected converts that table** (toast "Table 1 is now a long banquet table").
  - With nothing selected, it enters "tap the plan to place" mode for that type (toast).
  - Prototype bug fixed: before, picking "Long banquet" appeared to do nothing.
- **Add area** (Dance floor, DJ, Bar, Entrance, Balcony, Fireplace, Cake table, Photo booth, Gift table, custom):
  - The new area is placed in the **first free spot** on a 2.5% scan that doesn't overlap tables or areas.
  - It is auto-selected and drawn on top, with the toast "DJ added. Drag it into place, or resize it in the panel."
  - Prototype bug fixed: before, it landed at 50/50, hidden under tables, with no feedback, so it looked like nothing happened.
- **Snap to grid**: 2.5% steps, on by default, with grid lines every 5%. **"Line up tables"** clusters tables into rows (within 7%) and spaces each row evenly.
- **Save**: an explicit **Save seating** button with a toast, plus autosave on every change. In the real build, show "Saving… / Saved".
- Pointer handling: stopPropagation on **both** pointerdown and click for tables and areas, otherwise the plan's click handler deselects instantly (a prototype bug).
- Example plan modelled on Glenworth Valley's **Wilderness Room**:
  - balcony, bridal long table, 6 long tables × 20, dance floor, DJ, bar, fireplace, cake, **entrance**
  - approximate; the venue's real plan is uploaded as the background
  - the venue also has the Rainforest Room (lower level, opens to the lawn), so support multiple room plans per event
- Guests see a read-only plan. Entrance shown with ↓.
- Stress-tested in the prototype:
  - adding 10 areas in a row places all 10, without overlapping tables
  - converting a selected table to long works

## 3. Dietary: UPDATED
- Per person: Entrée / Main / Dessert.
- Exports: **wedding venue** and **30th caterer**.

## 4. Night-before guide: UPDATED
- Parking video + directions at the top.
- Tablemates dropdown.
- Long tables drawn as rectangles.
- Reception time in the summary.
- Irish goodbye.
- Taxis/Uber pre-book.

## 5. Invitation: UPDATED
- Original envelope kept, with texture, realistic seams, rings, sparkles and petals. **No** big glow.
- Theme, headline, date line, parking toggle, backup email and music are all editable in the admin.

## 6. Admin: UPDATED
- Overview "Needs you" list (bad or shared mobiles, unseated guests, meals not set, backup age, and more).
- Backup/restore. Mobile layout.

## 7. Seed data: NEW
`seed/sophie-nicholas.json`.

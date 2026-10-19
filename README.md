> **Read CHANGES_SINCE_LAST_BRIEF.md and docs/ first.** Where they differ from this README (stack, hosting, budget), they win.

# Handoff: Wedding invitation & guest-management platform

> Built first for Sophie & Nicholas. **The owner intends to sell it to other couples afterwards. Build it as a multi-tenant SaaS from day one** (see *Productisation*, the next section). Treat everything Sophie & Nicholas-specific in the prototypes as seed data for tenant #1.

## Overview
A private website for one wedding (Thu 18 Nov 2027, Glenworth Valley NSW) plus the groom's 30th (Sat 20 Nov 2027). About 75 invitations. It has five parts:

1. **Invitation** (`/`). An animated envelope that opens into an invitation. Each guest gets a personal link (`?g=<token>`), and it has an RSVP form for both events.
2. **Night-before guide** (`/tomorrow/?g=<token>`). Personal to each guest: parking video and directions, their table, who else is on their table, their meals, the run sheet, the menu, a photo QR code, travel, FAQ and contacts.
3. **Photo upload** (`/photos/?g=<token>`). Guests upload photos from the day.
4. **Admin** (`/admin`, passcode). Guest list, Excel import and export, dietary and meals, venue export, seating designer, SMS autopilot, inbox, photo album, editing the guest pages.
5. **Backend**. Stores everything, sends SMS automatically through Mobile Message (Australian provider), receives guest replies, and stores photos and video.

**The key requirement:** the owner does **not** want Google Sheets or any outside spreadsheet. The backend must be **built into the same deployment**. The prototype backend (`reference/backend_Code.gs`, Google Apps Script) is the **reference for the business logic only**. Port its logic. Do not reuse its storage.


## Productisation (required: build this in from the start)
**Tenancy and accounts**
- Each wedding is a **tenant** (`Wedding`). All data is scoped by `weddingId`.
- Guest pages are served from `{slug}.<product-domain>` or a custom domain (CNAME + automatic TLS).
- Users: owner (couple), co-owner, planner. Multiple weddings per planner account. Auth by email magic link plus optional passcode for guests-only pages.
- A super-admin console for the seller: tenants, usage, SMS spend, refunds, impersonate (with an audit log).

**Nothing hard-coded**
- **Events** are a list, not "Wedding" and "30th". Each event has:
  - name, date and time, venue, address, map link
  - RSVP questions (attending, numbers, custom questions: text, choice, yes/no, for example "riding?")
  - an optional "per event" invite flag on each invitation
- Every `W`/`B` field in the prototype becomes `invites: Record<eventId, boolean>` and `rsvp: Record<eventId, {...}>`.
- Copy everywhere (headline, sections, FAQ, run sheet, menu, dress code, accommodation, travel, contacts, SMS templates) is editable content. Store rich text per section, with section show/hide and drag-reorder.
- **Themes**: the 5 prototype themes (Cream & Sage, Bridgerton Blush, Visco Garden, Forest Green, Olive & Gold) become theme presets. Each preset is a token set: paper colours, ink, accent, seal colour, fonts.
  - Couple can tweak colours within guard-rails (contrast-checked) and upload a hero photo, a monogram (wax seal initials) and music.
- Envelope: monogram text and seal colour per tenant. Optional "liner" pattern choice.

**SMS as a product feature**
- Platform-level Mobile Message account.
- Each tenant gets a **prepaid SMS wallet**: buy packs via Stripe, with a configurable margin per SMS. Optional bring-your-own credentials.
- Each tenant gets its own dedicated reply number, or a shared number with reply routing by recipient phone and last-send.
- Hard stop when the wallet is empty. Show cost before every send.
- **Compliance (Australia, Spam Act 2003 / ACMA)**:
  - identify the sender in every message
  - honour STOP instantly, platform-wide per number
  - consent captured at import ("I have permission to text these guests")
  - quiet hours (default 8am–8pm recipient local)
  - log of every message
- Rate limits and abuse detection on new tenants.

**Billing (Stripe)**
- Plans, e.g. Free trial (up to 20 invitations, watermark), Standard (one-off per wedding, up to 150 invitations), Premium (unlimited, custom domain, seating, photo album, priority support).
- SMS packs are separate. Use Stripe Checkout and the customer portal. Webhooks provision features.
- Feature flags per plan, checked server-side.

**Photos and media**
- Per-tenant storage quota by plan. Presigned uploads. Image thumbnails generated server-side (sharp).
- Video transcoding optional (or limit size and duration).
- Guests' "download all" zip for the couple. Auto-delete N months after the event (configurable), with a warning email.

**Onboarding wizard** (first login)
1. Names and date
2. Events
3. Theme and photo
4. Import guests (Excel/CSV with the import rules in this README) or add manually
5. Preview as a guest
6. Connect SMS / buy credits
7. Publish

The checklist on the Overview ("Needs you") continues from there.

**Reliability ("bullet-proof" was an explicit owner requirement)**
- Server-side validation on every endpoint (zod). Optimistic UI with retry.
- **Never lose data**:
  - per-record updates with optimistic concurrency (`updatedAt` / version)
  - soft-deletes with undo (30 days)
  - nightly backups
  - a "Download backup" (JSON) and "Restore" in Settings (already in the prototype)
- Autopilot jobs are idempotent: unique (campaignId, sendDate, guestId) constraint, so a job can't send twice even if cron overlaps.
- Background job queue for sends: chunking, retry with backoff on 429/5xx, and the same Idempotency-Key on retry.
- Webhooks are verified (secret), de-duplicated and processed asynchronously.
- Admin works offline-tolerant: queue edits locally and sync. Show a clear "Saved" / "Saving…" / "Offline" state.
- Error monitoring (Sentry). Uptime checks. Audit log of admin actions.
- Accessibility: WCAG 2.2 AA on guest pages. Every interactive element keyboard reachable. Reduced-motion variant of the envelope (fade instead of 3D).
- Tests: unit tests for all business rules, Playwright end-to-end for RSVP, import, seating, autopilot (fake clock) and inbound replies. Start from the acceptance tests listed below.

**Privacy**
- Australian Privacy Principles. A privacy policy and terms per product. Guest data visible only to that tenant.
- Personal links use unguessable tokens (≥ 22 chars, URL-safe random).
- Guide and RSVP endpoints only ever return that guest's own data, plus tablemate **names** only.
- Data export and delete on request.

## About the design files
The files in `design/` are **design references built in HTML**. They are working prototypes that show the intended look and behaviour. They are not production code to copy directly. They run in a custom "Design Component" runtime (`.dc.html` with `{{ }}` template holes, a logic class and inline styles only), and that runtime should not be shipped.

Rebuild them in a proper stack. Recommended: **Next.js (App Router) + TypeScript**, deployed on **Vercel** or **Netlify**, with built-in storage:
- Data: Vercel KV / Upstash Redis, or Netlify Blobs, or a small Postgres (Neon / Vercel Postgres). The data is about 200 KB of JSON. One document per wedding is fine, but use per-guest records if you go with Postgres.
- Files (photos and the parking video): Vercel Blob or Netlify Blobs, or S3 / R2 with presigned direct uploads. Videos can be 100 MB or more, so **upload straight to storage with a presigned URL**, never through a function body. Function body limits are about 4.5–6 MB.
- Scheduler: Vercel Cron or Netlify Scheduled Functions, running every 15 minutes (the SMS autopilot).
- SMS: Mobile Message REST API (details below). Secrets go in environment variables.

The owner will deploy it once and never touch code. Everything else must be configurable inside the admin.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and animations are final. Recreate them pixel-faithfully, and keep the envelope animation timings exactly. All pages must work well on iPhone Safari first (most guests open from SMS or WhatsApp), and also on desktop.

---

## Screens / views

### 1. Invitation (`design/Sophie and Nicholas Invitation.html`)
This is a bundled single-file prototype. Open it in a browser to see it. The source template is JSON inside `<script type="__bundler/template">`.

**Envelope (closed, full screen)**
- Four flaps fill the viewport: bottom, left, right and top. Each is a `clip-path` triangle:
  - bottom `polygon(0 100%,50% 47%,100% 100%)`
  - left `polygon(0 0,56% 50%,0 100%)`
  - right `polygon(100% 0,44% 50%,100% 100%)`
  - top `polygon(0 0,100% 0,50% 56%)`
- Each flap uses a theme gradient (Cream & Sage theme, cream paper tones) plus a fine 45° crosshatch: `repeating-linear-gradient(45deg,rgba(255,255,255,.07) 0 1px,transparent 1px 7px)` and the same at −45°.
- Paper texture overlay (multiply): SVG feTurbulence grain (freq .95), fibres (.008 × .22), specks, mottle (.004), faint weave lines, and an edge vignette. A soft-light sheen at 115° sits on top.
- Seams: an SVG overlay (viewBox 0 0 100 100, `preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke`):
  - top flap edge `0,0 50,56 100,0` with a blurred cast shadow (9 px, blur .7, offset +1.1), a 3 px shadow, a 1.2 px dark line and a .9 px cream highlight offset −.28
  - visible bottom flap edges `0,100 45.9,51.4` and `54.1,51.4 100,100` with a smaller shadow and highlight
- Wax seal: centred at 50% / 56%, size `clamp(96px,24vmin,150px)`, sandstone gold radial gradient with irregular wax drips, embossed S&N monogram, shine sweep, drop shadow.
- "Tap to open" hint under the seal.

**Opening sequence** (state `p`):
- `p=1` on tap:
  - start the music, using the user gesture (iOS)
  - envelope scales to .985
  - two gold rings expand from the seal (`scale .8→1.7`, opacity 1→0, 1.3 s and 1.5 s +.25 s)
  - 16 gold sparkles burst outward (transform 1.2 s `cubic-bezier(.12,.75,.3,1)`, staggered 0–.12 s)
  - The owner explicitly rejected a large radial "flash" glow. Do not add one.
- `p=2` at 1500 ms:
  - flaps rotate open (top `rotateX(-112deg)`, left `rotateY(112deg)`, right `rotateY(-112deg)`, bottom `rotateX(112deg)`; 2 s `cubic-bezier(.45,0,.15,1)`)
  - seal flies up and fades
  - 22 petals and gold flecks fall (2.6–3.8 s, staggered)
  - card fades and scales in from 1.06 to 1
- `p=3` at 2700 ms, `p=4` at 4600 ms: envelope layer removed.

**Card (scrolling content)**: welcome, names, events, timeline, dress code, FAQ, accommodation, RSVP form. A floating "Scroll for details" pill shows while there is more below. Music toggle button at bottom right.

**RSVP form**:
- Guest is identified by `?g=token`, or by name lookup (main contact or partner names).
- Fields: per event yes/no (only the events they're invited to), number attending (1..max seats), riding (30th only), dietary, message.
- Submit goes to the backend `rsvp`. Changing the reply later is allowed.

**Music**: configured in admin (`content.audioUrl`). An MP3 URL is preferred, because YouTube audio is unreliable on iOS. Must start inside the tap handler.

### 2. Night-before guide (`design/Night Before Guide.dc.html`)
Max width 560, centred, mobile first. Sections in order:
1. **Hero**: full-bleed photo `assets/lookout.jpg` with a Ken Burns effect (scale 1.12→1, 9 s).
   - Date line, then "Tomorrow" in Pinyon Script 52–72 px, then "Dear {first names}…".
   - Summary row (wraps): Arrive · Vows · Reception · Table.
   - No countdown timer (owner removed it).
2. **Finding the ceremony** (top priority for the owner):
   - eyebrow "Before you set off", heading
   - the **parking video** (uploaded in admin; mp4, YouTube or Drive embed)
   - directions copy, address and arrival time, full-width "Open directions in Maps" button
3. **Your place at the reception** (dark `#2f3a26`):
   - one place card per person in the party. They flip up with `rotateX(80deg→0)`, staggered .18 s. Each shows the name in script, "Table N", and their meal.
   - **floor plan** (tables plus areas such as dance floor, DJ, bar, entry). Their table is highlighted with a pulsing ring.
   - **table dropdown**: tapping "Table 1" expands a list of everyone at that table, with their own party tagged "You". Grid-rows 0fr→1fr, .45 s.
4. **Order of events**: run sheet with a gold vertical line that draws in (scaleY 0→1, 2.4 s). The 11pm item is "The Irish goodbye".
5. **The menu** (alternate drop, dish A "or" dish B), plus the guest's dietary note in script.
6. **Share your photos**: QR code (generated from the photo upload URL, including the token) and an upload button.
7. **Parking & travel**:
   - Parking copy.
   - Getting home: taxis and Ubers rarely come out to the valley, so pre-book or have a designated driver.
   - Cocktails are at the Valley Events Centre.
8. **Quick answers**: accordion FAQ, including the Irish goodbye.
9. **On the day, call**: tap-to-call contacts. Sign-off.

All sections fade and rise in on scroll (IntersectionObserver, 1 s).

### 3. Photo upload (`design/Photo Upload.dc.html`)
- Hero photo, then greeting and a "Your name" field (prefilled from the token).
- A big "Choose photos" button allows multiple images.
- 3-column thumbnail grid with per-photo status: Waiting / spinner / Added / Tap to retry.
- Uploads go one after another. Resize on the client to a 2400 px long edge, JPEG .88, while also keeping the original if storage allows. Production: use presigned direct-to-storage uploads.

### 4. Admin (`design/RSVP Admin.dc.html`)
**Layout and navigation**
- Passcode screen (default `2027`; production should use a server-checked passcode or magic link).
- Layout: a 236 px dark sage sidebar (`#33402f`) with the nav plus a main area of max width 1180.
- **Below 760 px**: the sidebar becomes a sticky top bar with horizontally scrolling nav pills, and the guest table becomes cards.

**Tabs**
- **Overview**:
  - "N of M invitations answered" with a stacked bar (coming `#5d6b47` / declined `#b9a07a` / awaiting `#e6dcc4`).
  - 4 tappable figures: Wedding guests, 30th guests, Awaiting, Dietary.
  - **Needs you** checklist, auto-generated: replies needing a human, invitations awaiting, no mobile, wedding guests not seated, dietary meals not set, menu still "To be confirmed", website address not set.
  - Coming up (next autopilot texts) and Latest replies. Export buttons.
- **Guests**:
  - Search and filters (All / Awaiting / Wedding attending / 30th attending / Declined / Riding / Not invited yet).
  - Table. Inline "Invited to" select (Both / Wedding / 30th).
  - Side drawer per invitation:
    - **one main contact** (gets the texts) plus any number of other people
    - seats held, mobile
    - RSVP status per event
    - table, link copy, WhatsApp share
    - SMS history
  - **Import from Excel** (see the rules below) and a downloadable template. Export to Excel (sheets: Wedding, 30th, Dietary).
- **Dietary**:
  - Per-event dietary lists, with "Serious" flags for allergies, coeliac and anaphylaxis.
  - **Meals for the wedding**: for every person with a requirement, three inputs: **Entrée / Main / Dessert**. Blank means the standard dish.
  - **Export for the venue** (xlsx):
    - Summary sheet
    - Dietary by table (Table, Guest, Requirement, Entrée, Main, Dessert, Serious)
    - All guests by table
- **Texts (SMS)**:
  - "Replies from guests" inbox at the top.
  - One list of messages, ordered by next send. Each row: when, name, preview, recipient count, autopilot switch. Tap a row to edit it in place:
    - text
    - presets dropdown
    - insert chips: {first} {link} {guide} {photos}
    - "Rewrite with Claude"
    - character and SMS-part counter
    - send dates
    - recipients (with exclusions)
    - cost estimate
    - "Send now as well"
  - "+ New message" for a custom message with an audience picker.
  - Sent history.
- **Seating**:
  - Upload a venue layout image.
  - Add round tables (tap to drop, drag to move, rename, seat count).
  - Add areas: Dance floor, DJ, Bar, Entry, Cake table, Photo booth, Gift table, custom. Drag, resize with width and depth sliders, delete.
  - Assign people to seats: pick a table, then tap names. "Seat together" per invitation.
  - **Auto-seat the rest** keeps invitations together, filling tables largest group first.
  - Load example plan.
  - Guests only ever see a read-only plan.
- **Photos**: gallery grid with an uploader filter, open the full-size image, copy the upload link, download all (zip). Add this; the prototype lacks it.
- **Guest pages**:
  - Live phone-sized preview of the invitation or guide as any guest.
  - Edit invitation details: names, RSVP line, ride time, registry, directions, parking note, **music URL**.
  - Edit guide details: date and times, address, maps link, **parking directions**, **parking video upload**, parking, table note, getting home, photo link.
  - Edit run sheet rows, menu courses (A/B), contacts.
  - Copy link / Share on WhatsApp.
- **Settings** (replace the prototype's Google instructions):
  - Mobile Message credentials status (test-send button)
  - website address
  - cost per SMS (default 1.76¢ incl. GST: 1.6¢ + GST if credits are bought within 30 days of signup; 4¢ + GST standard)
  - cost estimate table
  - passcode change

---

## Data model (port from the prototype's localStorage key `sn-rsvp-admin-v1`)
```ts
Guest {            // one INVITATION
  id: string; token: string;           // token = personal link id (unguessable, ≥8 chars in prod)
  name: string;                        // main contact – receives SMS
  partners: string[];                  // other people on the invitation
  phone: string;                       // AU mobile, stored normalised "0412 381 904"
  max: number;                         // seats held
  W: boolean; B: boolean;              // invited to Wedding / 30th
  table?: string; optout?: boolean;
  rsvp: { w: boolean|null; b: boolean|null; n: number; ride: 'Yes, I will ride'|'Not sure yet'|'No, not riding';
          diet: string; msg: string; at: string|null /*Sydney local ISO "yyyy-MM-ddTHH:mm"*/; via: 'Invitation'|'Text reply'|'Admin' };
  sms: { type: string /*campaign key | 'reply' | 'thanks'*/; at: string; status: string }[];
}
Campaign { key; name; aud; audKey?: 'all'|'W'|'B'|'wYes'|'bYes'|'awaiting'|'declined'; text;
           mode: 'auto'|'dates'|'manual'; on: boolean; dates?: string[]; done?: string[]; excl: string[]; sentAt?: string }
Seating { img?: string; aspect: string; tables: {id,name,x,y,seats}[] /*x,y in % of plan*/;
          features: {id,label,x,y,w,h}[]; seats: Record<"guestId:personIndex", tableId> }
Meals   Record<"guestId:personIndex", { e: string; m: string; d: string }>
Inbox   { mid; id; at; gid; name; text; action }[]
Guide   { date, arrive, start, address, mapUrl, parkDirections, parkVideo, photoUrl, parking, tableNote, transport,
          runsheet:{t,what,where}[], menu:{course,a,b}[], contacts:{name,role,phone}[], faq:{q,a}[] }
Content { name1, name2, rsvpBy, rideTime, registryUrl, directionsUrl, parkingNote, audioUrl }
Photo   { id, by, token, at, url, thumbUrl }
Settings{ siteUrl, rate }
```
Person index 0 is the main contact; 1..n are the partners. If a single `diet` string mentions a first name, it attaches to that person; otherwise it attaches to person 0.

Default campaigns (keys, mode, send dates in Sydney time):
- `invite`, auto: to each new guest with a mobile, 8am–8pm only.
- `thanks`, auto: once per RSVP, sent after the reply (again if the reply changes).
- `reminder`, dates 2027-06-18 10:00, 07-18 10:00, 08-11 10:00: only guests invited **and still awaiting**. The text uses `{pending}` to name only the events still unanswered.
- `ride`, dates 06-20, 08-01: 30th "yes" guests who are riding or not sure.
- `nightW`, 2027-11-17 17:00: wedding "yes" guests, includes `{guide}`.
- `rain`, manual.
- `nightB`, 2027-11-19 17:00: 30th "yes" guests.
- `photos`, 2027-11-19 11:00: wedding "yes" guests, includes `{photos}`.

Exact copy is in the admin prototype (`seed()`, `AUTO0`, `PRESETS`).

## Backend API (port from `reference/backend_Code.gs`)
**Public endpoints**
- `guest`: look up by token.
- `find`: look up by name, matching the main contact or a partner, case and space insensitive.
- `rsvp`: clamp `n` to 1..max; set w/b only for invited events.
- `content`: returns the invitation text overrides.
- `guide`: guest + guide + seating + **mates** (names at the guest's tables, excluding their own party) + **meals** for that guest only.
- `photo upload`.

**Admin endpoints**: `load`, `save` (with **merge**, below), `send` (campaign, or specific guest ids), `test`, `photos`, `video`.

**Inbound webhook**: `POST /api/sms/inbound?hook=<secret>`.

**Merge rule on admin save**: the server holds newer data than the admin may have loaded. Keep:
- the server's RSVP when its `at` is newer
- the longer `sms` history
- `optout` flags
- the union of campaign `done` dates
- the newer `sentAt`
- the server inbox
- the longer log

With a real database, prefer per-field PATCH endpoints over whole-document saves.

**Autopilot** (cron every 15 min):
- `auto` campaigns run only between 08:00 and 20:00 Sydney time.
- `dates` campaigns: for each due date not yet in `done`, mark it done, then send to whoever qualifies **at that moment**.
- If the provider fails, roll back `done` so it retries next run.
- Never send to `optout` guests or guests without a phone. Log every send.

**Inbound replies** (Mobile Message webhook):
- Match the guest by normalised phone. De-dupe by `message_id`, because webhooks retry.
- `STOP` / `unsubscribe` sets optout.
- YES-like (`yes|y|yep|yeah|coming|attending|accept|definitely|absolutely|of course`) or NO-like (`no|n|nope|sorry|can't|cannot|unable|decline|regretfully`):
  - invited to **one** event: set that RSVP (yes sets n=max) and send a confirmation recorded as type `thanks`, so the thank-you autopilot doesn't double up
  - invited to **both**: reply with their link
- Anything else: action "Needs you", forwarded to `ADMIN_MOBILE`.
- Unknown numbers: forwarded.
- Must return 2xx within 5 s.

**Placeholders**: `{first}` = all first names on the invitation joined with ", " / " and ".

| Placeholder | Fills with |
|---|---|
| `{link}` | `${siteUrl}/?g=token` |
| `{guide}` | `${siteUrl}/tomorrow/?g=token` |
| `{photos}` | `${siteUrl}/photos/?g=token` |
| `{pending}` | "the wedding" / "Nicholas's 30th" / both |

## SMS provider: Mobile Message (mobilemessage.com.au)
- `POST https://api.mobilemessage.com.au/v1/messages`, HTTP Basic auth (API username and password from the dashboard, Settings > API).
- Body: `{ messages: [{ to, message, sender, custom_ref? }] }`, up to 10,000 per request.
- Always send an `Idempotency-Key` UUID header per batch. At most 5 concurrent requests; HTTP 429 means wait and retry.
- `sender` = the account's **free dedicated number** (so guests can reply), set as env `SENDER`.
- Non-GSM characters are stripped unless `enable_unicode`. Keep templates ASCII/GSM. Part counts: 160 characters single, 153 per part when concatenated.
- Inbound and delivery webhooks are configured in their dashboard. Verify the exact inbound payload field names against their docs (`llms-full.txt`). The prototype accepts `sender|from|number`, `message|text|body`, `message_id|id`.
- Env vars: `MM_USER`, `MM_PASS`, `SENDER`, `ADMIN_MOBILE`, `ADMIN_PASSCODE`, `HOOK_SECRET`, `SITE_URL`.

## Excel import rules
- First sheet not named like "instructions". Auto-detect the header row anywhere in the sheet.
- Main-contact column, any of: Main contact / Main guest / Lead guest / Lead / Guest / Guest name / Name / Household.
- Others: "Also on invitation" / Partner(s) / Plus ones / Others, split on `, ; & newline`, or separate `Guest 2`, `Guest 3`… columns.
- Mobile: any AU format, normalised (+61 → 0).
- Invited to: `Invited to` column (Both / Wedding / 30th), or separate Wedding / 30th Y/N columns. Default is both.
- Seats: the larger of the "Seats" column and the people count.
- Matching: by name, case-insensitive, or by mobile digits. Update existing records, never duplicate, and **keep RSVPs**. Confirm with "N new, M updated" before applying.
- Template: sheet "Guests" (`Main contact, Mobile, Also on invitation, Invited to`) plus sheet "How to fill this in".

## Design tokens
**Colours**

| Name | Hex |
|---|---|
| Ink | `#33402f` |
| Sage | `#55633f` / `#5d6b47` |
| Deep sage | `#3f4c33` / `#2f3a26` |
| Muted text | `#5b6a52` |
| Cream page | `#f6f0e2` |
| Card | `#fbf8f2` / `#fdfcf8` |
| Rule | `#e2d7bc` / `#c6b794` / `#ece3cc` |
| Gold | `#b39563` / `#c9a46a` |
| Terracotta (warnings / serious) | `#8a5a45` / `#7a4a37` |
| Light sage | `#cfd8bb` |
| Status green bg | `#dfe5cc` |
| Status amber bg | `#f1e7c9` |

**Type**
- Display: Cormorant Garamond 400/500/600 + italic.
- Script: Pinyon Script.
- UI: DM Sans 400/500/600.
- Eyebrows: 11 px, 600, letter-spacing .22–.32em, uppercase.
- Admin h1: 40 px (`clamp(32px,6vw,46px)` on overview).
- Guide h2: 38–40 px.

**Shape and motion**
- Pills: radius 999 px.
- Inputs: radius 8–10 px.
- Admin sections use 2 px ink top rules, not boxed cards. The owner disliked a generic card-grid look.
- Reveal: 1 s opacity + 1.2 s `cubic-bezier(.2,.7,.2,1)` translateY(26px).

## Assets
- `assets/lookout.jpg`: the ceremony site at The Lookout (from the owner's invitation file).
- Music: owner-supplied MP3, configured in the admin.
- Parking video: owner-uploaded.

## Acceptance tests (the prototype backend passed these in a simulated run; reproduce them as automated tests)
- 75 invitations: invites send once each, never between 20:00 and 08:00, and never twice.
- 30 RSVPs: 30 thank-yous, none repeated. A stale admin save does not wipe server RSVPs.
- A single-event guest texting YES gets RSVP yes, n=max, and a confirmation, with no extra thank-you. A both-events guest texting YES gets their link. A question is forwarded. An unknown number is forwarded. STOP opts the guest out of everything. A duplicate webhook is ignored. A wrong hook secret is rejected.
- Reminder on 18 Jun goes only to guests still awaiting and not opted out. `{pending}` names only the unanswered events. Running it again sends nothing.
- A provider failure (403) sends nothing and the next run retries successfully.
- Night-before texts go only to wedding "yes" guests, with the correct `/tomorrow/?g=` link. The photo text goes on 19 Nov at 11:00 with the `/photos/?g=` link.
- 300 guests with full SMS history load and save fine.
- Mobile check: every page at 375 × 812 has no horizontal scroll (except deliberate nav pills), tap targets ≥ 44 px, and text ≥ 14 px.

## Files
- `design/Sophie and Nicholas Invitation.html`: invitation (bundled; template JSON inside).
- `design/Night Before Guide.dc.html`: guide (template + logic class).
- `design/Photo Upload.dc.html`: photo upload.
- `design/RSVP Admin.dc.html`: admin. The logic class holds the seed data, campaigns, presets, import/export, seating and autopilot logic.
- `reference/backend_Code.gs`: prototype backend; port its rules, not its Google storage.
- `assets/lookout.jpg`.

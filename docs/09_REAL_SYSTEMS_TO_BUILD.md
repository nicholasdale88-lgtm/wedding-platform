# 09: Real systems Claude Code must build (the prototype only fakes these)

The HTML prototypes in `design/` **simulate** these features in one browser, using localStorage and IndexedDB. **None of them work for real yet.** Each one must be built properly in the real app, with a server, a database and storage, so it works for every guest on any device.

> **Device rule for everything below:** every feature must work fully on **phones (iPhone Safari, Android Chrome) and on desktop browsers**. Guests open links from SMS and WhatsApp on phones. The couple manages the admin on a phone or a laptop.
> - Touch and mouse both supported (pointer events).
> - Layouts reflow from 360 px up to 1440 px.
> - No hover-only actions.
> - Tap targets ≥ 44 px.
> - Installable as a home-screen web app (PWA manifest + icons) for the admin.

---

## A. Personal links (linking)
**Prototype:** the links are fake (`sophieandnicholas.com/?g=token`) and the pages read guests from the same browser's storage.

**Build:**
- Every invitation gets an unguessable 22-character token on create (docs/03 `invitation.token`).
- The token is never shown in admin lists, only via "Copy link" and "Share".
- Routes (docs/02):

| Page | Route |
|---|---|
| Invitation | `/w/:slug/?g=:token` |
| Guide | `/w/:slug/tomorrow?g=:token` |
| Photos | `/w/:slug/photos?g=:token` |

- The server resolves the token to the invitation. A bad or expired token shows a friendly "Find your invitation" name lookup (rate-limited).
- **Link previews**: server-render `<title>`, `og:title`, `og:description` and `og:image` (the hero photo) for every guest route, so WhatsApp and iMessage show a nice card. Use a Pages Function or Worker HTML rewrite; the SPA alone can't do it.
- **Short links** for SMS (saves characters and credits):
  - `/:code` (6-char code) does a 302 redirect to the full personal URL, with codes stored in a `short_link` table
  - SMS templates use the short link automatically
  - track clicks (first and last opened) and show "Opened invitation" in the guest drawer
- "Copy link", "Share on WhatsApp" (`https://wa.me/61XXXXXXXXX?text=` + encoded message) and the native `navigator.share` sheet on phones.
- Optional QR code per invitation, for printed cards, downloadable as PNG.
- Link rotation: an "Issue new link" button in the guest drawer invalidates the old token (in case it was forwarded).

## B. SMS automation
**Prototype:** the "autopilot" only runs while the admin page is open, and sends nothing.

**Build exactly to docs/05_SMS_ENGINE.md:**
- Cloudflare Cron every 15 minutes, idempotent `sms_out.dedupe_key`, quiet hours in the wedding timezone, slot claiming, retry and rollback.
- Mobile Message client.
- Inbound replies (YES/NO/STOP/question), delivery receipts, and short links inside messages.
- Admin "Texts" screen with real data (sent, delivered and failed per message), plus "Send test to me".
- Safety:
  - "Pause all texts" kill switch
  - wallet or credit check before each batch
  - a daily cap per wedding (default 500)
  - a confirm dialog showing count and cost for any manual send
- Must pass the 9 fake-clock tests in docs/05.

## C. Seating chart
**Prototype:** works in one browser only. The plan image is stored as base64 in localStorage (too big for real use).

**Build:**
- Data in D1 (`seat_table`, `seat_area`, `seat_plan`, `person.table_id`). The plan image goes to R2 through a presigned upload.
- Designer UI (admin), mobile and desktop:
  - plan background upload (JPG/PNG/PDF first page rendered to PNG in the browser with pdf.js), with aspect ratio kept
  - **round** and **long banquet** tables: drag, rotate across or up-down, length, seats up to 60, rename
  - areas: Entrance, Dance floor, DJ, Bar, Balcony, Fireplace, Cake, Photo booth, Gift table, custom. Drag, resize with handles on desktop and sliders on mobile, delete.
  - **snap to grid** (2.5%) and **Line up tables**
  - new areas placed in the first free spot, auto-selected, with a toast (see CHANGES file)
  - pinch-zoom and pan the plan on phones; long-press to drag on touch so page scrolling still works
  - assign guests: select a table, tap names; "Seat together"; **Auto-seat** (keep invitations together, largest first); drag a name onto a table on desktop
  - seat counts with an over-capacity warning
  - undo/redo (last 20 actions)
  - every change saves as a PATCH with "Saving… / Saved" shown. An explicit **Save** button also exists for confidence.
  - multiple room plans per event (Glenworth has the Wilderness Room and the Rainforest Room)
  - print or export: a PDF/PNG of the plan with table lists, for the venue
- Guest view (night-before guide): read-only plan with their table highlighted, plus a dropdown per table listing tablemates (names only).

## D. Photo uploads (guests)
**Prototype:** photos are saved only in the uploader's own browser (IndexedDB); the couple never receives them.

**Build:**
- `/w/:slug/photos?g=token` (the token is optional; without one, ask for a name).
- Multi-select up to 50 per batch; also open the phone camera (`accept="image/*"` + `capture` option).
- Client side:
  - read EXIF orientation and fix rotation
  - convert HEIC to JPEG (iPhone): Safari usually converts on select; otherwise use `heic2any`, lazy-loaded
  - resize to a 2400 px long edge, JPEG .88, plus a 600 px thumbnail
- Upload directly to R2 with presigned PUTs. Show per-file progress. 3 parallel uploads. Retry ×3 with backoff. Resume after a dropped connection (the queue is kept in IndexedDB until confirmed).
- After the PUT, POST a record (`media` kind=photo, uploaded_by, invitation_id).
- Limits: 25 MB per original, server-checked via the content-length condition on the presigned URL. Per-wedding storage quota by plan.
- Moderation: the couple can hide or delete any photo.

## D2. Filters and frames on upload (NEW; guests on phone or website)
Guests can upload from **any phone or any computer browser** (iPhone Safari, Android Chrome, desktop Chrome, Safari, Firefox, Edge).
- **Phone**: "Take a photo" (camera, `capture="environment"`) or "Choose from library" (multi-select).
- **Desktop**: drag-and-drop onto the page, or the file picker.

**Edit step, optional and skippable** ("Add all as they are" is the default big button). Tap a thumbnail to open the editor:
- **Filters** (6 presets plus Original), applied with Canvas 2D `ctx.filter`, with a pixel-loop fallback for older Safari:
  - **Original**
  - **Valley Warm**: `sepia(.18) saturate(1.1) contrast(1.05) brightness(1.04)`
  - **Sage**: `saturate(.85) hue-rotate(-8deg) contrast(1.02)`
  - **Film**: `contrast(1.12) saturate(.9) sepia(.12)` + grain overlay
  - **Black & White**: `grayscale(1) contrast(1.1)`
  - **Soft**: `brightness(1.06) contrast(.92) saturate(.95)`
  - **Golden Hour**: `sepia(.3) saturate(1.25) hue-rotate(-12deg) brightness(1.05)`
- An intensity slider (0–100%) blends the filtered image over the original.
- **Frames**, drawn on the canvas in the locked palette and fonts:
  - **None**
  - **Polaroid**: `#fbf8f2` border, deep bottom, with "Sophie & Nicholas · 18.11.27" in Pinyon Script
  - **Gold Line**: `#b39563` 1 px inset line + 3 px margin
  - **Sage Mat**: `#5d6b47` mat with a cream inner line
  - **Monogram Seal**: a small wax-seal S&N in the bottom corner
  - **Postcard**: notched corners like the invitation sections
- Frame text (names and date) comes from the wedding settings, so it works for any couple.
- Crop: free, 1:1, 4:5 and 9:16 (pinch on phone, drag handles on desktop). Rotate 90°.
- Live preview at screen size. The final render runs at full resolution in an OffscreenCanvas or Web Worker where supported, so the page doesn't freeze.

**Upload what was chosen**:
- **both** the edited version **and the original**: `photo.jpg` (edited) and `original.jpg`, linked to one `media` row
- the couple's album shows the edited version, and can download originals
- store the chosen `filter`, `intensity`, `frame` and `crop` in the `media.edit` JSON column, so it can be re-rendered later

**Rules**:
- Editing is per photo. "Apply to all" copies the current filter and frame to the rest of the batch.
- HEIC conversion and EXIF rotation happen **before** editing.
- Strip GPS EXIF from uploaded files for privacy (keep date-taken).
- Accessibility: every control is keyboard-reachable. Filter names are text labels, not just swatches.
- The couple can turn filters and frames on or off, and pick which frames are offered (Admin → Photos → Settings).

**Schema addition**: `ALTER TABLE media ADD COLUMN original_key TEXT; ALTER TABLE media ADD COLUMN edit TEXT;`

**Tests**: an iPhone 13 Safari emulation (HEIC → edit → upload), Android Chrome, and desktop drag-drop of 20 files. The edited output matches the preview. GPS is stripped.

## E. Photo album (couple)
- Admin Photos tab: infinite-scroll grid of thumbnails, filter by uploader or date, open full size, select multiple, download selected, **Download all (zip streamed from R2)**, delete, and "share album link" (an optional read-only gallery for guests, toggle on or off).
- Storage: R2 `media/{weddingId}/photos/{ulid}.jpg` and `…/thumbs/{ulid}.jpg`.
- Retention: auto-delete N days after the event (configurable), with a warning in "Needs you" 14 days before.

## F. Video uploads (parking video, and any other guide videos)
**Prototype:** the video stays in the admin's browser only.

**Build:**
- The admin uploads MP4/MOV/WebM up to **200 MB** with a **multipart upload to R2** (presigned part URLs, 10 MB parts, resumable, progress bar).
- On a phone, the upload continues if the screen locks for a short time; warn the user to keep the app open.
- Store as `media` kind=video. Generate a poster frame in the browser (draw the first frame to a canvas) and upload it as a JPEG.
- Playback on the guide: `<video playsinline controls preload="metadata" poster=…>` served from R2 with **HTTP range requests** (R2 supports these), so iPhones can seek. Also accept a YouTube or Vimeo link as an alternative.
- No transcoding (budget). Show a warning if the file isn't H.264/AAC MP4 ("may not play on some phones; export as MP4 from your phone's Photos app").

## G. Other uploads
- **Music** for the invitation: MP3/M4A up to 15 MB to R2. It plays from the tap on the envelope (iOS needs a user gesture). Volume fade-in. Mute button.
- **Hero photo** and **venue plan**: images up to 15 MB, resized in the browser.
- **Excel/CSV guest import**: parsed on the server with SheetJS. Preview, then commit (docs/04).

## I. Customisation (couple edits everything in the admin; nothing hard-coded)
Every guest-facing word, link and section is per-wedding content (`wedding.content` / `wedding.guide` JSON, validated by zod), edited in **Admin → Guest pages** with a live phone preview:
- **Names, monogram, headline, date line, theme** (5 presets plus colour tweaks within contrast limits), hero photo, music.
- **Gift registry**:
  - one or more registry links (label + URL, e.g. "David Jones registry")
  - optional **gift account / wishing-well details** (heading + text, e.g. BSB and account number), shown as a card
  - optional message
  - the whole section can be hidden
- **Countdown**: on or off, plus a target event.
- **Events**: name, date and time, venue, address, map link, dress code, and per-event sections (timeline, details, FAQ items, accommodation, parking, transport).
- **Links everywhere** (registry, directions, accommodation, venue sites) are validated URLs (https only) and open in a new tab.
- Section order: drag to reorder. Each section has its own show/hide toggle.

## J. Per-guest visibility (must be enforced on the server)
- A guest only ever sees events they're invited to. If an invitation is **not invited to the 30th**, then on the invitation, the RSVP form, the guide, the FAQ, the countdown and every SMS:
  - all 30th content is **hidden**: section, timeline items, FAQ group, ride question, RSVP question, accommodation notes tagged to that event
  - copy that mentions both events adapts ("RSVP for the wedding" vs "the wedding and the 30th")
- Before a guest is identified (no token, or name lookup not done yet), show **all** events including the 30th. Hide 30th content only once the guest is identified AND not invited (owner decision; see MASTER_BRIEF §4).
- Implement as: every content block and FAQ item has `eventKeys: string[]` (empty means all). The server filters the content in `GET /invite` and `GET /guide` by the invitation's `invite_event` rows. **Never send hidden content to the browser.**
- Tests: wedding-only, 30th-only and both-event guests each see exactly their content (Playwright snapshot per type).

## K. Weather forecast on the night-before guide (NEW, automatic)
The design adds a **"The forecast"** section, directly **before** "Finding the ceremony". Its visuals are locked:
- an icon, a summary and a detail line
- 4 time slots tied to the run sheet (vows, mid-afternoon, dinner, 9pm), each with temp and chance of rain
- a smart tip
- a "Full forecast at the Bureau of Meteorology" link

**Data (free, automatic, no key needed):**
- **Source of truth for display: BOM.** The link always goes to the BOM forecast page for the venue's town. The admin sets this once, auto-filled from the venue address: for Glenworth Valley use the nearest BOM place page (e.g. `https://www.bom.gov.au/places/nsw/glenworth-valley/forecast/`; verify the slug, falling back to Gosford).
  - BOM's public JSON (`api.weather.bom.gov.au/v1/locations/{geohash}/forecasts/daily` and `/hourly`) is unofficial and may block server requests.
  - Try it first, using the location geohash from `/v1/locations?search=Glenworth Valley`.
  - If it fails, fall back to **Open-Meteo** (free, no key, commercial use OK with attribution): `https://api.open-meteo.com/v1/forecast?latitude=-33.42&longitude=151.19&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Australia/Sydney`. Venue lat/long are geocoded from the address once and stored on the event.
- **Cron** (the existing 15-min Worker): from 7 days before each event, refresh the forecast every 3 hours and cache it in D1 (`event.weather` JSON + `weather_updated_at`). Guests read the cache only, never the weather API directly.
- **Mapping**:
  - map the weather code to one of the locked icons (sun, sun+cloud, cloud, rain, storm, wind)
  - summary text in plain English ("Mostly sunny", "Showers clearing")
  - the time slots come from the event's run sheet times (vows, dinner) plus +2h and 9pm
- **Smart tip rules**:
  - rain ≥ 40% in any slot: mention the wet-weather plan (balcony of the Valley Events Centre) and shoes
  - evening < 17°: suggest a wrap or jacket
  - max > 30°: shade, water and sunscreen
- **"Updated"** line: "Updated 3:00pm". If the data is older than 12 hours, show "Check BOM for the latest".
- If no forecast is available yet (more than 7 days out), hide the slots and show "The forecast appears here a week before the day", plus the BOM link.
- **Admin**:
  - Guest pages → Night-before guide → Weather: on/off, BOM link (auto-filled, editable), wet-weather note text
  - Needs-you item "Rain likely tomorrow: review the rain text" when rain ≥ 50%, with one tap to the manual Rain SMS
- Also shown for the 30th guide (ride + picnic), with the tip "Bring water and food; hat and sunscreen for the picnic".

## H. Done means
For each system above:
1. It works on iPhone Safari, Android Chrome, desktop Chrome, Safari and Firefox.
2. It survives a page refresh mid-action.
3. It shows clear progress and error messages.
4. It has automated tests: unit tests for the logic, and Playwright at 375×812 and 1280×800.
5. Nothing is stored only in the browser except temporary upload queues.

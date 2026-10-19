# MASTER BRIEF: read this first, then build without asking

This is the **single source of truth**: every owner preference and decision from the whole design conversation. If anything here conflicts with another doc, **this file wins**, then CHANGES_SINCE_LAST_BRIEF.md, then docs/.
Claude Code must be able to build the whole product from this pack **without the owner prompting again**. Only stop to ask when a design element is technically impossible (see §1).

---

## 1. The golden rule: graphics are LOCKED
- Everything in `design/` is final:
  - `Sophie and Nicholas Invitation.html`
  - `Night Before Guide.dc.html`
  - `Photo Upload.dc.html`
  - `RSVP Admin.dc.html`
  - `assets/`
- **Build code around it. Do not redesign, restyle, reword, reorder, "modernise" or "improve" anything visible.**
- Copy inline style values verbatim (colours, sizes, clip-paths, easings). Extract SVGs as-is. Fonts: Cormorant Garamond, Pinyon Script, DM Sans.
- Pixel-match at 375×812 and 1280×800 (≤2% diff). See DESIGN_LOCK.md.
- New screens with no design (login, wizard, errors, super-admin) reuse the existing admin components and colours only.
- The bundled invitation's source is the JSON in `<script type="__bundler/template">`. `JSON.parse` it to read the markup and logic.

## 2. What to build (everything real, nothing faked)
- **Multi-couple wedding platform.** This couple (Sophie Bloor & Nicholas Dale) is tenant #1. It must be sellable to other couples.
- **Stack** (A$150 total budget):
  - Cloudflare free tier: Workers + Hono API, Pages + Vite React, D1 + Drizzle, R2 storage, Cron Triggers every 15 min
  - Claude Pro for building
  - a domain
  - SMS credits
  - No Google Sheets. No Next.js/Vercel (ignore any old mention).
- Order of work: docs/06_MILESTONES.md. Real systems: docs/09. Admin: docs/10. SMS: docs/05. Schema: docs/03. API: docs/04. Deploy: docs/08.
- **Every feature works on phones and desktops**, touch and mouse, from 360 px up: iPhone Safari, Android Chrome, desktop Chrome, Safari, Firefox and Edge.

## 3. The couple and events (seed: `seed/sophie-nicholas.json`)
- **Wedding**: Thursday 18 November 2027, 2:00pm, The Lookout, Glenworth Valley NSW (69 Cooks Road). Reception at the Valley Events Centre, cocktails, dancing until 11:00pm.
- **Nicholas's 30th**: horse riding + picnic. **Riders arrive by 9:30am (30 minutes before the 10:00am ride).** Guests should *bring water and some food or snacks for the ride*. This note appears on the RSVP ride question, the 30th section, the dress code and the 30th night-before SMS.
- Contact email: **sophienickwedding@outlook.com.au**. Groom: Nicholas 0411 039 612. Venue office: (02) 4375 1222.
- Local cabs: **Central Coast Taxis 02 4337 3999** (maxi taxis up to 11) or 13 10 08. Tap-to-call. Shown in the invite FAQ (train/taxi + getting home) and the guide (transport + contacts).
- From Wollongong: about 2 h (~170 km), via M1 → M5 → M7 → M2 → NorthConnex → M1 → Calga exit → Cooks Rd (tolls).
- Night-before guide SMS at **5:00pm** the night before.
- Nearest station: Gosford, ~23 km. A taxi is ~$40–55. Taxis and Ubers rarely come out, so **pre-book**.

## 4. Invitation: behaviour (visuals locked)
- **Envelope**:
  - The original design: theme-coloured flaps with crosshatch, soft realistic seams, wax seal, "Tap to open".
  - On tap: rings, sparkles and falling petals. **No big glow flash.**
  - Timing: open 1.5 s, card 2.7 s, envelope gone 4.6 s.
- **Never show the envelope again once opened.** Remember it per token (localStorage, 90 days) plus server `opened_at`. On reload, timeout or a return visit, go straight to the open invitation and restore scroll. A small "Replay envelope" link sits in the footer.
- **Music**: plays once from the envelope tap, then stops (no loop). Mute/replay button. MP3 uploaded in the admin (YouTube is a fallback only). Needs a user tap on iOS.
- **"Scroll for details"**:
  - **one only** at any time. The inline one sits in the hero.
  - the floating pill appears only after scrolling past the hero (>240 px) and hides near the end
  - **the floating pill changes colour to suit the background behind it**: cream pill with sage text on light sections; translucent dark pill with cream text on dark sections and photos
  - tapping it scrolls ~85% of a screen
- **Paper texture**: faint grain (~0.07) + fibres (~0.05) behind and between the sections.
- **Sections**, in this order:
  1. Welcome
  2. Countdown
  3. The Wedding
  4. Timeline
  5. Dress Code
  6. Accommodation
  7. Gift Registry (multiple links, button text, optional gift-account card with BSB and account)
  8. **Birthday & Horse Riding (30th)**
  9. RSVP
  10. FAQ (the 30th FAQ group at the bottom, in its own blue panel: `#e7eef8` / `#2f4d7a` / `#3d5f92`)
  11. 30th Dress Code
- **30th visibility rule**:
  - Show the 30th section and 30th FAQ to **everyone, unless the guest is identified AND not invited to the 30th**. Then hide every 30th mention.
  - Unidentified visitors (no personal link, no lookup yet) **do see** the 30th.
  - The server filters content for identified non-invitees.
- **RSVP must be very simple**: one screen, plain questions, big buttons.
  - "Can you come to the wedding?" and "Can you come to Nicholas's 30th?", answered with **Yes, I'll be there** / **Sorry, can't make it**. Only invited events show.
  - After a Yes: "How many of you are coming?" (stepper) and "Any dietary needs? (optional)", per person.
  - A Yes to the 30th adds "Will you join the horse ride?".
  - "A note for us (optional)". One Send button (sticky on mobile).
  - A thank-you with a summary and "Change my answer". Under 30 s on a phone.
  - From a personal link: no lookup; it greets them by name.

## 5. Night-before guide (visuals locked)
- Personal per guest; it unlocks the night before.
- **Order**:
  1. Hero (photo, "Tomorrow", Arrive / Vows / Reception / Table)
  2. **Weather forecast**
  3. Finding the ceremony + **parking video at the top**
  4. Seating (tables as a dropdown; tap "Table 1" to see who's there; long tables drawn as rectangles; entrance ↓)
  5. Run sheet
  6. Menu
  7. Reception (dark sage)
  8. Transport
  9. Contacts ("On the day, call")
  10. Photo upload QR
- **Weather**:
  - a condensed, classy block with clear spacing and ruled borders from the neighbouring sections
  - icon + summary + detail, 4 time slots matching the run sheet (temp + rain %), a smart tip, and a link to the BOM forecast
  - **auto-updated**: cron refreshes it every 3 h from 7 days out and caches it in D1
  - BOM API first, Open-Meteo fallback. If there's no data yet: "The forecast appears here a week before the day" + the BOM link.
  - A rain ≥ 50% alert appears in the admin "Needs you" list (docs/09 §K).
- No countdown timer. Mention cocktails at the Valley Events Centre, pre-booking taxis, and the Irish goodbye (no farewell line).

## 6. Photos
- Guests upload from **phone (camera or library) or website (drag-drop or picker)**. HEIC conversion, EXIF rotation, GPS stripped.
- **Optional filters and frames** before upload. Spec: docs/09 §D2.
  - Filters: Valley Warm, Sage, Film, B&W, Soft, Golden Hour, plus an intensity slider.
  - Frames: Polaroid with names and date, Gold Line, Sage Mat, Monogram Seal, Postcard.
  - Plus crop, rotate and "apply to all".
- **Filters and frames are designed in `design/Photo Filter Studio.dc.html` → exported `design/filters.json`.** Claude Code integrates that file exactly (docs/11) and adds the studio to the admin so couples can make their own.
- **Text on photos**: guests (and the couple's defaults) can add text such as "Sophie & Nick's wedding". Presets, Script/Serif/Capitals, top/middle/bottom, cream/gold/sage/ink, size, max 60 chars. It is in filters.json under `text`.
- **The studio is built into the admin** (Photos → Filters & frames).
- Store the edited and original versions.
- **Admin Photos tab**: uploads appear automatically (live), with a New badge, select and **Download all / selected as a .zip** (originals + an `edited/` folder), streamed from R2.

## 7. Guests and words
- One **main contact** per invitation gets all texts; any number of people can share an invitation. Each invitation can be invited to any subset of events.
- **Never use the word "household"** in the UI. Say "guest" and "invitation" (e.g. "34 guests on 22 invitations").
- **Set menu by default**: guests without dietary requirements automatically get the set menu, and exports say "Set menu".
- Exports: Wedding / 30th / Dietary sheets. On each event sheet, yes first, then waiting, then declined; riding only on the 30th sheet. Plus caterer exports for the venue and the 30th.

## 8. SMS: "just runs"
- Autopilot is on by default, shown as one timeline.
- **Never remind someone who has replied.** Quiet hours apply. Australian Spam Act rules: sender ID, opt-out "Reply STOP".
- Night-before texts per event. A manual Rain SMS. A test send to yourself. Pause all.
- Spec: docs/05.

## 9. Seating
- Round and long banquet tables (across or up-down, length, up to 60 seats). Areas: dance floor, DJ, bar, entrance, balcony, fireplace, cake, photo booth, gift, custom.
- New areas go to the first free spot, auto-selected, with a toast.
- Picking a type with a table selected converts that table.
- Snap to grid + "Line up tables". **Explicit Save seating** (server save now, "Saved <time>" label, version history) + autosave. Persists across devices.
- stopPropagation on pointerdown **and** click.
- Example plan: the Wilderness Room (balcony, bridal table, 6×20 long tables). Support multiple rooms. The venue's real plan is uploaded as the background.
- Guests' view is read-only.

## 10. Admin: advanced, but simple to set up
- Fully built, matching `design/RSVP Admin.dc.html` exactly:
  - sidebar `#33402f`
  - ruled sections (2 px top rule), not card grids
  - pill buttons, status pills, right-side drawer, bottom toast
  - (CHANGES §0g)
- Tabs: Overview ("Needs you" with one-tap fixes), Guests, Dietary, Texts, Seating, Photos, Guest pages (editor + live phone preview), Settings. Plus the onboarding wizard.
- **Everything customisable, no code** (docs/10):
  - events
  - RSVP question builder
  - FAQ
  - section show/hide/order
  - all wording
  - theme (5 locked palettes)
  - envelope/music
  - registry/gift account
  - transport/taxis
  - contacts
  - weather
  - SMS templates/schedule/automations
  - seating
  - exports
  - roles
  - domain
  - backups
- **Simple mode by default.** A 6-step wizard (~10 min). The Advanced toggle reveals more in place.
- Live preview, autosave, undo, version history, draft/publish, ⌘K search.
- "Needs you" covers: bad or shared mobiles, unseated guests, meals not set, backups older than 7 days, rain likely.
- Backup download/restore.
- Nothing couple-specific is hard-coded: grep `apps/web/src` for "Sophie" and get zero results.

## 10b. Sellable product
- See docs/13. The admin is a product for any couple. Sophie & Nicholas are only the seed tenant. No couple-specific content in code.

## 10c. Offline (MUST)
- Invitations, guides and the upload page work offline after first open: PWA + service worker, cached personal data, queued RSVPs and uploads (CHANGES §0z).

## 11. Owner's working style
- Be concise. Don't pad, and don't add sections or features that weren't asked for.
- The owner dislikes: generic card grids, glow flashes, the word "household", hard-coded content, anything that needs code edits or Google Sheets.
- The owner likes: the original envelope, rings/sparkles/petals, ruled editorial layouts, subtle paper texture, simple one-screen RSVP, everything editable in the admin.

## 12. Prompt history (chronological summary of owner requests)
1. Designed the Sophie & Nicholas invitation with an animated envelope, sections, RSVP, and a separate 30th birthday + horse ride.
2. Admin for RSVPs, then a full admin: guests, dietary, texts, seating, photos, settings. No Google Sheets. Everything editable.
3. Night-before guide: personal, parking video first, table dropdown, run sheet, menu, Irish goodbye, taxis.
4. Excel export split into Wedding / 30th / Dietary. Removed "household".
5. Seating: long banquet tables, areas, the DJ bug, snap/line-up, save, Wilderness Room example.
6. Envelope: realistic seams, no glow, soft seams, no ring under the seal.
7. Simple RSVP. Horse-ride water/snacks note. 30th FAQ panel. Contact email. Gift account. Music plays once. Paper texture.
8. Claude Code pack: build everything, A$150 budget, sellable multi-couple platform.
9. Graphics locked; build code around them.
10. Don't return to the envelope after a timeout or reload.
11. Photo filters and frames; uploads from phone or website.
12. Weather forecast in the guide, linked to BOM, auto-updating. Moved above "Finding the ceremony", condensed, with spacing.
13. Local cab company in the invite FAQ and the guide.
14. Advanced admin where everything is customisable, but simple to set up.
15. Scroll-for-details pill adapts to the background; only one shows at a time.
16. Save the seating chart reliably. Photos appear in the admin when guests upload; download them as a zip.
17. A Photo Filter Studio to design custom filters + example frames; Claude Code integrates them via filters.json.
18. Text on filters ("Sophie & Nick's wedding"); the filter studio built into the admin.
19. Stress it: every feature must run flawlessly; constantly stress test and trial everything.
20. If no one has dietary requirements, default to the set menu.
21. Guest pages tab set out as simple numbered steps, like the SMS setup.
22. Filters on the Guests tab (event, dietary, seating, mobile, size, sort) + clear + count.
23. Horse ride: arrive 30 minutes early (9:30am).
24. **Admin must be sellable**: any couple buys it and customises it for their wedding (docs/13).
25. Customise the admin name and EVERY field/word in the invitation and night-before guide from the admin.
26. Night-before guide sent to guests at 5pm.
27. FAQ: drive time and best route from Wollongong.
28. A night-before guide for the 30th (design/Night Before 30th.dc.html), sent at 5pm on 19 Nov.
29. The 30th section shows for everyone except identified guests not invited to it.

## 12b. Quality: flawless, constantly stress-tested
- The owner insists **every feature runs flawlessly**. Follow docs/12 on every task: tests first, the full suite on all devices, a stress pass, the visual diff, and a TEST_LOG entry.
- A 75-guest dress rehearsal + a 7-day staging soak before go-live.

## 13. Done means
- Every item above is working in production on phone and desktop, matching `design/` pixel-for-pixel.
- All tests in docs/06 pass. A test couple can sign up, run the wizard, import guests, send invites, collect RSVPs, auto-text, seat guests, collect photos and export, without touching code.

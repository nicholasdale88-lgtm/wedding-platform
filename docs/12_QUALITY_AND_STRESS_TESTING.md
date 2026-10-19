# 12: Quality bar. EVERY feature must run flawlessly.

**The owner's #1 instruction: nothing ships broken.** Guests are family and friends on old phones and patchy rural signal. Treat every feature as mission-critical.
**Constantly stress test and trial every feature. After every milestone, re-run the full suite, not just the new tests.**

## Non-negotiable process (every task, every time)
1. **Write the tests first** (unit + integration + Playwright E2E) for the feature you're about to build.
2. Build it.
3. Run **the whole suite** on: iPhone 13 Safari (WebKit emulation), Pixel 7 Chrome, iPad, desktop Chrome/Firefox/Safari, at 360 px, 375 px, 768 px and 1280 px.
4. Run the **stress pass** (below) for that feature.
5. Run the **visual-lock diff** against `design/` (≤2%).
6. Fix everything, then re-run 3 to 5. Only then tick the milestone. Log the results in `docs/TEST_LOG.md` (date, feature, pass/fail, what broke, the fix).
7. CI (GitHub Actions) runs all of this on every push. **Red CI means stop and fix before anything else.**

## Stress pass per feature (minimum)
- **Envelope / invite**:
  - 50 rapid taps on the seal
  - reload mid-animation
  - background the tab for 30 min, then return: no envelope, scroll restored
  - slow 3G (Lighthouse throttling) loads in under 3 s
  - airplane mode after load
  - music on iOS with the silent switch on and off
- **RSVP**:
  - 75 guests submitting at once (k6 / autocannon)
  - double-tap Send
  - submit offline, then reconnect (it queues and retries)
  - change an answer 10 times
  - emoji and 500-char notes
  - mobile keyboard covering the button
  - token for a deleted guest
  - no token + name lookup with typos and accents
- **30th visibility**: a non-invited token never receives 30th data, checked in the **API response**, not just the UI.
- **SMS engine**:
  - a dry-run of the full schedule for 200 guests
  - quiet hours
  - a STOP reply mid-campaign
  - nobody who has replied gets a reminder (assert 0)
  - provider 500s/timeouts (retry with backoff, no duplicates: idempotency key per message)
  - cron firing twice in parallel
  - clock jumps across a DST change
- **Seating**:
  - 300 guests and 30 tables
  - drag on touch and mouse
  - add 20 areas in a row (none overlap)
  - convert table types
  - save on phone, open on desktop (identical)
  - two admins editing at once (last-write-wins with a "changed elsewhere, reload?" prompt)
  - undo/redo, version restore
- **Photos**:
  - 20 photos at once from an iPhone (HEIC), 25 MB each
  - flaky network mid-upload (resumable / retry per file)
  - 500-photo album loads fast (thumbnails, lazy-load)
  - **zip download of 500 photos** streamed and completed on a phone
  - GPS stripped (assert on EXIF)
- **Filters, frames and text**:
  - every filter × frame × text position renders identically in preview and final canvas (visual test)
  - long text, emoji and an apostrophe ("Nick's")
  - on a low-memory Android, at a 6000 px photo (downscale safely)
- **Weather**: BOM down, Open-Meteo down, both down (graceful message), stale cache, more than 7 days out.
- **Admin**:
  - every button on every tab clicked by an automated crawler with no console errors
  - import 1,000-row CSV with bad rows (clear errors, nothing lost)
  - backup, wipe, restore (byte-identical)
  - Simple and Advanced modes
  - wizard completed on a phone in under 10 min
- **Security**:
  - guest tokens unguessable (≥128-bit)
  - rate limits on RSVP, lookup and upload
  - admin routes require auth (test each route without a session = 401)
  - no PII in logs
  - OWASP ZAP baseline scan clean
- **Accessibility**: axe-core with 0 serious issues, and keyboard-only for the full RSVP and upload flows.

## Trial runs before go-live
- A **75-guest dress rehearsal** using seed data plus 5 real phones (the owner's family): invite, RSVP, reminders, night-before guide, photo uploads, zip download.
- A **7-day soak** on staging with cron running and synthetic RSVPs arriving: no errors, no duplicate SMS, costs inside budget.
- Monitoring: Sentry (free tier) on web + workers, plus an uptime check. Alerts go to the owner's email.

## Definition of done (per feature)
Tests are green on every device profile, the stress pass is green, the visual diff is within 2%, there are no console errors, and the results are logged in TEST_LOG.md. **If any check fails, it is not done.**

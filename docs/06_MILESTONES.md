# 06: Milestones and tasks

> Every task's "done" includes docs/09 §H: works on phone **and** desktop, survives refresh, clear progress/errors, tests at 375×812 and 1280×800. (tick `[x]` as you go; one task per Claude Code session)

Each task is about 1 focused session. "Check" means what the owner should look at before moving on.

## M0: Accounts (owner, ~30 min, no code)
- [ ] Create a GitHub account and an empty private repo `wedding-platform`.
- [ ] Create a Cloudflare account (free). Install Node 20+ and pnpm. Run `npx wrangler login`.
- [ ] Optional now, required before M4: buy the domain in Cloudflare Registrar.

## M1: Foundations
- [ ] M1.1 pnpm monorepo (apps/api, apps/web, packages/shared). TypeScript strict, ESLint, Prettier, Vitest. `pnpm dev` runs the Worker (wrangler dev) and Vite together with an `/api` proxy.
- [x] M1.2 D1 database + migrations from `docs/03_SCHEMA.sql`, plus a Drizzle schema. R2 bucket `media`. `wrangler.toml` bindings and cron.
- [x] M1.3 Seed script: create wedding `sophie-and-nicholas`, its 2 events, guide, campaigns + slots, and the sample guests from `seed/sophie-nicholas.json`. Owner user from the `SEED_OWNER_EMAIL` env var.
- [ ] M1.4 Auth: email + passcode login, sessions, membership checks, a `/me` route, and a login screen styled like `design/RSVP Admin.dc.html` (passcode screen). _API done and green; the login screen comes with the web app scaffold._
- [ ] M1.5 Shared libs: phone normalise (AU), tokens, time zones (Temporal polyfill or date-fns-tz), audit log. Unit tests.
- [ ] M1.6 Deploy to Cloudflare (Pages + Worker on `/api/*`). Check: login works on your phone.

## M2: Guest pages (pixel-faithful; mobile first)
- [ ] M2.0 Visual reference harness: open each design file headless and save reference screenshots per screen and state (DESIGN_LOCK.md). Extract SVGs and textures verbatim.
- [ ] M2.1 Theme system: tokens + the 5 presets, fonts (Cormorant Garamond, Pinyon Script, DM Sans), paper textures as CSS. Make sure inline SVG data URIs use `data:image/svg+xml,`, **not** `;utf8`.
- [ ] M2.2 Envelope component, matching `design/Sophie and Nicholas Invitation.html`:
  - 4 clip-path flaps, seam SVG overlay, wax seal with monogram, texture overlay
  - tap: rings + sparkles; at 1.5 s flaps open + petals; card at 2.7 s
  - `prefers-reduced-motion` gives a simple fade
  - music starts inside the tap handler
  - Check on an iPhone.
- [ ] M2.3 Invitation content sections from `wedding.content` (headline, names, events, timeline, dress code, FAQ, accommodation, parking toggle, registry). "Scroll for details" pill.
- [ ] M2.4 RSVP flow: token or name lookup, per-event yes/no, numbers, per-person dietary, custom questions (ride), message. Edit later. Success state.
- [ ] M2.5 Night-before guide, matching `design/Night Before Guide.dc.html`:
  - hero (no countdown)
  - **Finding the ceremony** (parking video, directions, Maps button)
  - place cards with meals
  - floor plan (round + long tables, areas, my table pulses)
  - **table dropdown with tablemates**
  - run sheet (Irish goodbye), menu, QR to photos, travel (taxis/Uber pre-book), FAQ accordion, contacts
  - scroll reveals
- [ ] M2.6a Personal links per docs/09 §A: tokens, routes, server-rendered link previews (og tags), short links `/:code` with click tracking, WhatsApp/native share, rotate link.
- [ ] M2.6 Photo upload page (docs/09 §D, real R2 uploads, HEIC/EXIF, resumable queue): name, multi-select, client resize + thumbnail, presigned PUT, per-photo status and retry, "keep page open" notice.
- [ ] M2.6b Photo editor per docs/09 §D2: filters + intensity, frames, crop and rotate, apply to all, edited + original upload, GPS strip. Phone camera/library and desktop drag-drop.
- [ ] M2.7 Lighthouse mobile ≥ 90 performance, ≥ 95 accessibility on all guest pages. Check: open all three pages from a text on an iPhone.

## M3: Admin (full build. Visual spec = design/RSVP Admin.dc.html; see CHANGES 0g)
- [ ] M3.0 Admin design system in `apps/web/src/admin/ui`: Shell, PageHeader, Section (2px rule), Row, PillButton (primary/secondary/dashed), Field, StatusPill, Figure, Drawer, Toast, Switch, Sheet (mobile). Build a `/admin/_kitchen-sink` page with every component, and screenshot-compare against the design.
- [ ] M3.1 Shell: sidebar on desktop, swipeable top tabs under 760 px. Toasts. "Saving… / Saved / Offline" indicator. 409 handling.
- [ ] M3.2 Overview: answered bar, 4 figures, server-computed **Needs you** list, coming up, latest replies.
- [ ] M3.3 Guests: list + mobile cards, search/filters, drawer (main contact + people, seats, phone validation, events invited, RSVP override, copy link, WhatsApp share `https://wa.me/61…?text=`, SMS history), soft delete + undo.
- [ ] M3.4 Excel import (SheetJS) with the rules in README, preview screen ("N new, M updated, K errors"), template download. Export guests.
- [ ] M3.5 Dietary: per-event lists, serious flags, **per-person Entrée/Main/Dessert**, **venue export** (wedding) and **caterer export** (30th).
- [ ] M3.6 Seating designer (docs/09 §C, including pinch-zoom, long-press drag on touch, undo/redo, multiple rooms, print/export):
  - plan image upload
  - round + long tables (drag, rename, seats up to 60, direction, length)
  - areas (dance floor, DJ, bar, entry, cake, photo booth, gift, custom) with drag/resize/delete
  - assign by tapping, "seat together", auto-seat, example plan
  - pointer events must not toggle selection on the same click (stopPropagation on table pointerdown **and** click)
- [ ] M3.7 Guest pages editor:
  - invitation content, theme picker, music upload/URL, hero photo
  - guide fields, run sheet/menu/contacts/FAQ editors
  - parking video upload (R2, 200 MB cap) or YouTube link
  - live phone-frame preview as any guest
- [ ] M3.7a Video upload per docs/09 §F: multipart R2, 200 MB, progress, poster frame, range playback on iPhone.
- [ ] M3.8 Photos gallery (docs/09 §E): filter by uploader, download all (zip), delete.
- [ ] M3.9 Settings: backup download/restore, pause all texts, quiet hours, SMS rate, admin mobile, sender, change passcode.

## M4: SMS
- [ ] M4.1 Sign up to Mobile Message (50 free credits). Claim the dedicated number. Create API keys. `wrangler secret put` them.
- [x] M4.2 Mobile Message client + segments counter + template renderer + audience evaluator. Unit tests. (Done early: SMS first.)
- [ ] M4.3 Autopilot cron exactly as docs/05, with fake-clock tests 1–9. _Engine, cron and tests 1, 2, 4–8 done and green; 3 and 9 wait for the admin API (M3)._
- [ ] M4.4 Texts screen, matching `design/RSVP Admin.dc.html` → Texts:
  - list by next send with switches; inline editor
  - presets, placeholder chips, cost + parts, send dates
  - recipients with exclusions; send now (confirm); history
- [ ] M4.5 Inbound + delivery webhooks. Inbox UI. Set the webhook URLs in the Mobile Message dashboard. Test with your own phone: YES, NO, STOP, a question.
- [ ] M4.5a Advanced admin per docs/10: Simple/Advanced toggle, setup wizard, RSVP question builder, section order/visibility, versioned content + publish, roles, audit log, ⌘K search.
- [ ] M4.5b Weather per docs/09 §K: geocode the venue, cron refresh + cache, guide section, rain Needs-you alert.
- [ ] M4.6 **Buy credits now** (within 30 days of signup, 1.6¢ rate). Send a test to yourself from every campaign.

## M5: Make it sellable (cheapest path)
- [ ] M5.1 Super-admin: create a wedding (slug, names, owner email), set plan, add SMS credits, usage view.
- [ ] M5.2 Onboarding wizard for a new couple (names/date → events → theme/photo → import guests → preview → publish).
- [ ] M5.3 SMS wallet: credits deducted per part. Block sends at 0. Needs-you alert at 20% left.
- [ ] M5.4 Payments with **Stripe Payment Links** (no code to start). The webhook (`checkout.session.completed`) adds credits or a plan to the wedding matched by `client_reference_id = wedding.id`.
- [ ] M5.5 Magic-link login via Resend (free tier). Invite a co-owner or planner.
- [ ] M5.6 Legal pages (privacy policy under Australian Privacy Principles, terms, SMS consent text). Spam Act: sender identified in templates, STOP honoured.

## M6: Hardening
- [ ] M6.1 Playwright e2e at 375×812: RSVP, import, seating, autopilot (fake clock endpoint in dev only), inbound.
- [ ] M6.2 Rate limits (find, uploads, login). Audit log viewer. Daily D1 export to R2 (cron at 03:00) kept for 30 days.
- [ ] M6.3 Load test 300 invitations. Error boundary pages. "Something went wrong, your changes are safe" copy.
- [ ] M6.4 Go-live checklist (docs/08) for Sophie & Nicholas.

# 13: Sellable admin. Any couple can buy it and make it theirs.

The admin is a **product**, not Sophie & Nicholas's tool. Sophie & Nicholas are just tenant #1, loaded from `seed/sophie-nicholas.json`. A stranger must be able to buy it, set it up and run their whole wedding **without contacting the owner or touching code**.

## Hard rules
- **Zero hard-coded couple content** anywhere in admin, guest pages, SMS templates, exports or filenames:
  - names, dates, venue, events ("30th", "horse ride"), menu, contacts, taxis, times (e.g. "arrive by 9:30am")
  - Everything comes from the tenant's settings. CI grep test: `Sophie|Nicholas|Glenworth|30th|horse` in `apps/*/src` = 0 results (seed and test fixtures excepted).
- **Events are generic**: a couple can have 1 to N events (Wedding, Welcome drinks, Recovery brunch, a Birthday…). Each has its own name, date, place, run sheet, dress code, RSVP questions, extras (e.g. an activity like a "horse ride" with "arrive 30 min early" + "bring water and snacks" notes), and invite list. The 30th + ride are just this couple's second event built from that.
- **Activity add-on pattern** (generic version of the horse ride):
  - fields: activity name, booking link/phone, start time
  - **arrive-early minutes** (auto-writes "Arrive by 9:30am, 30 minutes early" into the invite, RSVP, guide and night-before SMS)
  - what to bring, what to wear, "book your own" steps
- **The whole admin UI reads the couple's names and branding** (sidebar script name, export filenames, zip names, SMS sign-off).
- Admin copy is neutral ("your wedding", "your guests"). Guest-facing copy comes from editable templates with merge tags: `{couple}`, `{partner1}`, `{partner2}`, `{event}`, `{date}`, `{venue}`, `{first}`, `{link}`, `{table}`, `{arrive_by}`.

## Selling flow (Stripe)
1. Landing page → **Start free** (build and preview everything; sending SMS or publishing needs a plan).
2. Sign up (email magic link or Google), then the **6-step wizard** (docs/10 §1). Choose a template: Garden (this design), plus room for future locked templates.
3. Their site goes live at `{slug}.yourbrand.com.au` instantly. Custom domain optional (Cloudflare for SaaS / custom hostnames).
4. Plans (A$, GST incl., editable by super-admin):
   - **Essentials**: invite + RSVP + admin
   - **Complete**: + SMS automation, night-before guide, seating, photos, filters
   - **SMS credit packs** at cost-plus
   - One-off payment per wedding, active until 90 days after the last event, then read-only + export.
5. Stripe Checkout + webhooks. Plan gates are enforced on the server.

## Multi-tenant safety
- Every table has `wedding_id`. Every query is scoped by middleware; there are tests proving tenant A can never read tenant B (API + R2 keys + SMS logs).
- Roles per wedding: Owner, Partner, Planner, Viewer, Seating-only. Invite collaborators by email.
- **Super-admin console** (the owner): tenants, plans, refunds, SMS credit balances, impersonate (logged), feature flags, template management, global announcements.
- Data export (a full zip: guests CSV/XLSX, RSVPs, seating PDF, photos) and **delete my wedding** (GDPR/Privacy Act style).

## Self-serve support built in
- Every setting has a one-line help + example. Empty states have one clear next action.
- "Preview as guest" for any guest, plus "Send me a test" for every SMS and page.
- A **Launch checklist** on Overview:
  - names
  - events
  - venue
  - theme
  - guests imported
  - test SMS received
  - invite preview checked
  - published
- Help centre pages (Markdown in the repo) linked contextually, plus a contact form to the owner.

## Done means
A tester who has never seen the project buys a plan with a Stripe test card and sets up a different wedding: one event, no birthday, a different venue, a different menu. They import 50 guests, send invites, take RSVPs and export, all in under 30 minutes. Nothing from Sophie & Nicholas appears anywhere. Add this as a Playwright E2E ("stranger-couple.spec.ts") and run it in CI on every push.

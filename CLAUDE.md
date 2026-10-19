# EVERY FEATURE MUST RUN FLAWLESSLY. Constantly stress test and trial every feature (docs/12): write tests first, run the FULL suite on every device profile after every task, and log results in docs/TEST_LOG.md. Red tests mean stop and fix.
# This is a SELLABLE product: any couple must be able to buy and customise it with no code (docs/13).
# Guest pages MUST work offline (PWA, CHANGES §0z).
# Read MASTER_BRIEF.md first. It is the single source of truth. Graphics in design/ are LOCKED; build code around them. Work through docs/06 milestones without waiting for the owner.

# CLAUDE.md: rules for this repo (Claude Code reads this automatically)

## What we're building
A multi-tenant wedding invitation and guest-management product. Tenant #1 is Sophie & Nicholas (wedding Thu 18 Nov 2027 and Nicholas's 30th Sat 20 Nov 2027, Glenworth Valley NSW, about 75 invitations). The owner will sell it to other couples afterwards.

Specs live in `/docs`. Read the relevant doc **before** starting a task. Do not re-read all docs every session.

## Hard constraints
- **Nothing couple-specific is hard-coded.** Every guest-facing text, toggle and list is editable in the admin (docs/10). Keep setup simple: Simple mode by default, Advanced on request.
- **DESIGN IS LOCKED.** Read DESIGN_LOCK.md. Build all functionality, but reproduce the graphics in `design/` pixel-for-pixel. Never redesign, restyle or reword. Ask before any visual change.
- **Total budget A$150**, including Claude usage. Everything must run on **free tiers**: Cloudflare Workers, Pages, D1, R2 and Cron. No paid services except Mobile Message SMS credits and a domain.
  - Never add a dependency that needs a paid plan.
  - Never use Vercel or Netlify, because their free cron is too limited.
- **Owner is not a developer.** Every setting lives in the admin UI, not in code or a spreadsheet. No Google Sheets.
- **Mobile first.** Guests open links from SMS and WhatsApp on iPhones. Test at 375×812. Tap targets ≥ 44px, text ≥ 14px, no horizontal scroll.
- **Bullet-proof data.**
  - Server-side validation (zod) on every endpoint.
  - Per-record updates, never whole-document overwrites.
  - Soft deletes.
  - Idempotent SMS sends (unique key: campaign + sendSlot + invitation).
- The design files in `/design` are **references**. Match them pixel-faithfully, but rebuild in React + Tailwind. Never copy their runtime (`support.js`, `{{ }}` templates).

- **Phone and desktop.** Every feature must work on iPhone Safari, Android Chrome and desktop browsers, with touch and mouse (pointer events), 360–1440 px. The admin is installable as a PWA.
- **No fakes.** The prototype simulates links, SMS, seating sync and uploads in one browser. Build them for real per docs/09_REAL_SYSTEMS_TO_BUILD.md.

## Stack (do not change without asking)
- `apps/web`: Vite + React 18 + TypeScript + Tailwind + React Router. Guest pages and admin SPA. Deployed to Cloudflare Pages.
- `apps/api`: Cloudflare Worker using Hono + zod + Drizzle ORM (D1/SQLite). Cron trigger `*/15 * * * *`.
- Storage: R2 bucket `media` (photos, videos, music, plan images). Uploads go **direct from the browser** with presigned PUT URLs (aws4fetch).
- SMS: Mobile Message REST API (see docs/05_SMS_ENGINE.md).
- Tests: Vitest (unit + Worker via `@cloudflare/vitest-pool-workers`), Playwright (mobile viewport).
- Package manager: pnpm workspaces.

## Working style (saves budget)
- Work one milestone task at a time from `docs/06_MILESTONES.md`. Tick it off in that file when done.
- Keep diffs small and focused. Run `pnpm test` and `pnpm typecheck` before saying a task is done.
- Commit after every completed task: `git commit -m "M2.3 RSVP form"`.
- Don't generate long explanations. Short summary plus what to check.
- When unsure about a product decision, ask one short question instead of guessing big.

## Conventions
- Times are stored as **UTC ISO strings**. Every wedding has a `timezone` (default `Australia/Sydney`). Convert at the edges. Quiet hours and send dates are evaluated in the wedding timezone.
- Australian mobiles are stored as E.164 `+614XXXXXXXX`, displayed as `0412 345 678`.
- Tokens: guest link tokens are 22-char URL-safe random (`crypto.getRandomValues`).
- All guest-facing endpoints return only that guest's own data, plus tablemate **names**.
- Money is stored in integer cents (AUD).
- Copy tone: warm, plain Australian English. No emoji. GSM-7 characters only in SMS templates.

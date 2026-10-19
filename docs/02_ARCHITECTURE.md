# 02: Architecture

## Repo layout
```
/
├─ CLAUDE.md                 rules (auto-loaded)
├─ README.md                 product + screen spec (long)
├─ docs/                     these build docs
├─ design/                   HTML design references (do not ship)
├─ seed/sophie-nicholas.json tenant #1 seed: events, guide, campaigns, presets, sample guests, example seating
├─ apps/
│  ├─ api/                   Cloudflare Worker (Hono)
│  │  ├─ src/index.ts        router + cron handler (scheduled)
│  │  ├─ src/db/schema.ts    Drizzle schema (mirror of docs/03_SCHEMA.sql)
│  │  ├─ src/routes/public.ts   guest endpoints
│  │  ├─ src/routes/admin.ts    couple/admin endpoints (auth)
│  │  ├─ src/routes/hooks.ts    Mobile Message inbound + delivery webhooks
│  │  ├─ src/sms/            mobileMessage.ts, templates.ts, autopilot.ts, inbound.ts, segments.ts
│  │  ├─ src/lib/            auth.ts, tokens.ts, phone.ts, time.ts, r2.ts (presign), audit.ts
│  │  ├─ migrations/         D1 SQL migrations (wrangler d1 migrations)
│  │  ├─ test/               vitest (fake clock)
│  │  └─ wrangler.toml
│  └─ web/                   Vite React SPA → Cloudflare Pages
│     ├─ src/guest/          Invitation/, Envelope/, Rsvp/, Guide/, Photos/
│     ├─ src/admin/          Overview, Guests, Dietary, Texts, Seating, Photos, Pages, Settings, Onboarding
│     ├─ src/ui/             shared components (Button, Field, Pill, Sheet, Toast, Accordion)
│     ├─ src/theme/          tokens.ts + 5 theme presets
│     └─ src/lib/api.ts      typed fetch client (zod schemas shared from packages/shared)
└─ packages/shared/          zod schemas + types shared by api and web (Invitation, Rsvp, Campaign…)
```

## URLs (per tenant)
Tenant routing by **path prefix** keeps it free (no wildcard certificates needed): `https://<domain>/w/<slug>/…`. A custom domain per couple can come later through Cloudflare for SaaS, which is paid, so it is deferred.

| Page | URL |
|---|---|
| Invitation | `/w/sophie-and-nicholas/?g=<token>` |
| Night-before guide | `/w/sophie-and-nicholas/tomorrow?g=<token>` |
| Photo upload | `/w/sophie-and-nicholas/photos?g=<token>` |
| Admin | `/admin` (choose wedding after login) |
| Super-admin | `/super` |

The API is served on the same domain at `/api/*` (Pages Functions proxy, or the Worker on a route `<domain>/api/*`), so there's no CORS.

## Auth
- **Couples/admins**: email + passcode for M1 (hashed with PBKDF2 through WebCrypto, session cookie signed with HMAC, `HttpOnly; Secure; SameSite=Lax`, 30 days). Magic link by Resend in M5.
- **Guests**: no login. The `?g=token` link identifies them. If there's no token, lookup by name (main contact or partner, case and space insensitive). Rate-limit lookups to 10 per IP per minute (D1 counter or Cloudflare Rate Limiting rule).
- **Roles** in `membership`: `owner`, `editor`, `viewer`. Super-admin is an env allow-list of emails.

## Request flows
**RSVP**
1. The guest opens `/w/slug/?g=tok` and GETs `/api/p/:slug/invite?g=tok`, which returns the invitation, its people, events invited to, current RSVP and theme/content.
2. Submit POSTs `/api/p/:slug/rsvp`. Validate it, upsert per event, write `rsvp.updated_at`, and enqueue a `thanks` send (picked up by the next cron, or sent immediately if the autopilot is on and within quiet hours).

**Admin edits**
- Every list item has its own PATCH (`/api/a/:wid/invitations/:id`).
- Send `If-Match: <version>`. A mismatch returns 409, and the UI refetches and shows "Updated elsewhere, reloaded".

**Uploads**
1. POST `/api/p/:slug/uploads` with `{kind, contentType, size}` returns `{key, url}` (a presigned R2 PUT, 15 minutes).
2. The browser PUTs the file directly.
3. POST `/api/p/:slug/photos` with `{key}` records the row.
4. Photos are resized in the browser first (2400 px long edge, JPEG .88) and a 600 px thumbnail is made in the browser too. Both are uploaded, so no server image processing is needed.

**Cron** (`scheduled`, every 15 minutes): `runAutopilot(env, now)` (docs/05). It also cleans up expired upload keys and rate-limit rows.

## Environment and secrets (wrangler secret put …)
| Name | Purpose |
|---|---|
| `SESSION_SECRET` | 32+ random bytes for cookies |
| `MM_USER`, `MM_PASS` | Mobile Message API credentials (platform account) |
| `MM_HOOK_SECRET` | Random string added as `?k=` to webhook URLs |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` | For presigning |
| `SUPER_ADMINS` | Comma-separated emails |
| `PUBLIC_BASE_URL` | e.g. `https://yourdomain.com` |
| `RESEND_API_KEY` | M5 only |
| `STRIPE_WEBHOOK_SECRET` | M5 only |

Bindings in wrangler.toml: `DB` (D1), `MEDIA` (R2), cron `*/15 * * * *`.

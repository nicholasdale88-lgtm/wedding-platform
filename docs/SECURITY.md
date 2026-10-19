# Security

What protects the platform. Every item marked *(tested)* is tried as an attack on every build in `apps/api/test/security.test.ts` or the suite named.

## Accounts and sessions
- Passcodes: PBKDF2-SHA256, 100,000 iterations, random salt, constant-time compare. Unknown emails take the same time as wrong passcodes. *(auth.test)*
- Sessions: a 256-bit random token in an `HttpOnly; Secure; SameSite=Lax` cookie. The database stores only HMAC(SESSION_SECRET, token), so a database leak can't log anyone in. *(tested)*
- Login brute force: 10 tries per email and IP, and 30 per IP, every 15 minutes. *(tested)*
- Every admin route checks session and membership. Another wedding's id gives 404, never "forbidden", so ids can't be probed. *(tested)*

## Requests
- Cross-site writes: a write must be JSON (a plain HTML form can't send it), and any browser Origin that isn't ours is refused. *(tested)*
- Body size: 100 KB cap, enforced while reading (not just from the declared length). *(tested)*
- All input goes through zod schemas. All SQL is parameterised. Injection-shaped text is stored as plain text. *(tested)*
- Edits use optimistic versions (`If-Match`), so two people can't silently overwrite each other. *(admin.test)*
- Guest links carry a 131-bit random token. A link shows only that invitation: no other guest's names or phone numbers. *(tested)* Name lookup is rate limited. *(guest.test)*
- A guest not invited to an event never receives its details or wording. *(guest.test)*

## Webhooks and SMS
- Webhooks need the secret key (constant-time compare), plus the optional HMAC signature with a timestamp window. *(tested, inbound.test)*
- SMS sends are idempotent (dedupe keys and provider Idempotency-Key). They respect a daily cap, quiet hours, platform-wide STOP and a pause switch. *(autopilot, stress tests)*

## Browser
- API responses: `no-store`, `nosniff`, `DENY` framing, `no-referrer`, a deny-all CSP. *(tested)*
- Site (`apps/web/public/_headers`): strict CSP (scripts only from this site), HSTS, no framing, same-origin referrers (guest tokens never leak to other sites), no indexing, and a locked-down Permissions-Policy. CI fails if the headers are missing from the build.
- React escapes all text, and the app never sets raw HTML from data.

## Supply chain and secrets
- CI fails on high or critical vulnerabilities in runtime dependencies (`pnpm audit`), and on anything that looks like a committed key.
- Dependabot opens weekly update PRs, and CI must pass on each.
- Secrets live only in GitHub Actions secrets and Cloudflare. `SESSION_SECRET` is generated at first deploy and never leaves Cloudflare.
- If a key is ever pasted anywhere public, roll it at the provider straight away.

## Reporting
Email the owner. Don't open a public issue.

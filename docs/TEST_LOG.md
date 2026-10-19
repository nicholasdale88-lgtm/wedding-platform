# Test log (docs/12)

Each entry: date, feature, result, what broke, the fix. Results come from GitHub Actions (no Node on the dev machine).

| Date | Feature | Result | Notes |
|---|---|---|---|
| 2026-10-19 | M1.1 scaffold, shared libs, SMS engine (M4.2/M4.3 core) | Superseded | Waiting for the GitHub repo. Fake-clock tests 1, 2, 4–8 written; 3 and 9 need the API/D1 layer. Year-long stress simulation with 200 invitations added. |
| 2026-10-19 | CI run 39189228824 (commit 280678f) | **Pass** | Typecheck, lint and tests green. Earlier runs failed on CI setup (lockfile and cache), one type error (OutboxRow vs NewOutbox status) and one lint error (literal no-break space in a regex); all fixed. |
| 2026-10-19 | M1.2 D1 schema, Drizzle mirror, D1 SMS store, webhooks, cron (run 39190112936, commit 5ff6f49) | **Pass** | New: schema parity test, D1 store contract tests (atomic claims under concurrency, dedupe, STOP), end-to-end autopilot + inbound on a real local D1, webhook security (bad key 401, HMAC signature, retries acted on once), cron sweep of unprocessed replies. One CI failure first: Drizzle composite-key syntax not supported by the installed version; switched to the object form. |
| 2026-10-19 | M1.3 seed + M1.4 sign-in (run 39190739726, commit dcf5a50) | **Pass** | Seed loads 22 invitations, 2 events, 8 campaigns, 8 slots, seating; Sydney times to UTC; dietary attach rule; the autopilot on the seeded data invites only the one guest the prototype hadn't texted; .sql file loads identically. Sign-in: secure cookie, hashed session ids, same answer for wrong passcode or unknown email, rate limit (429 after 10), expiry, logout, membership 404 for other weddings, JSON-only writes, refuses without SESSION_SECRET. |

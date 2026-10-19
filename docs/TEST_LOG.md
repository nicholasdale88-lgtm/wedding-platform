# Test log (docs/12)

Each entry: date, feature, result, what broke, the fix. Results come from GitHub Actions (no Node on the dev machine).

| Date | Feature | Result | Notes |
|---|---|---|---|
| 2026-10-19 | M1.1 scaffold, shared libs, SMS engine (M4.2/M4.3 core) | Superseded | Waiting for the GitHub repo. Fake-clock tests 1, 2, 4–8 written; 3 and 9 need the API/D1 layer. Year-long stress simulation with 200 invitations added. |
| 2026-10-19 | CI run 39189228824 (commit 280678f) | **Pass** | Typecheck, lint and tests green. Earlier runs failed on CI setup (lockfile and cache), one type error (OutboxRow vs NewOutbox status) and one lint error (literal no-break space in a regex); all fixed. |

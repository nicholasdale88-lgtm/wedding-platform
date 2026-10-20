# Backups and security workflow

How no information is lost, how each wedding's data stays its own, and what to do when something goes wrong.

## 1. Backups: four layers

| Layer | What it holds | How often | Where | Kept |
|---|---|---|---|---|
| **D1 Time Travel** | The whole database, any minute | Continuous | Cloudflare | 7 days on the free plan (30 on Workers Paid) |
| **Restore point before every deploy** | A bookmark taken before migrations run | Every deploy | The deploy log (`scripts/deploy.sh`) | As long as Time Travel |
| **Nightly encrypted export** | The whole database as SQL, gzip + AES-256 | Every night at about 2am Sydney (`.github/workflows/nightly.yml`) | GitHub Actions artifact | 30 days |
| **The couple's own daily backup** | Their wedding as one JSON file | Every day (the cron, `apps/api/src/lib/backup.ts`) | The **Backups** folder in their linked Google Drive, Dropbox or OneDrive | As long as they keep it |

Couples can also tap **Back up now** or **Download backup** under Account → Backup.

A couple's backup includes every part of their wedding: guests, replies, texts, seating and its versions, the planner, the party, messages, and photo details. It never includes passcodes, sessions, storage keys or another wedding's rows (`apps/api/test/launch.security.test.ts` checks this).

### One-time setup (owner)
1. Add a GitHub secret named **`BACKUP_PASSPHRASE`**: a long random phrase, also kept in your password manager. Without it, the nightly job only records a restore point and never uploads an unencrypted copy, because this repository is public.
2. Link a Google Drive, Dropbox or OneDrive for your wedding (Photos → Where photos are saved). The folders are set up straight away, and the daily backups start within the hour.

### Restore drill (try it once before going live)
- **Undo a bad change from the last few days:**
  - Find the time or the bookmark in the deploy log ("Restore point before migrations").
  - Run `wrangler d1 time-travel restore wedding-db --timestamp=<ISO time>`, or use `--bookmark=<bookmark>`.
  - Everything after that moment is undone, for every wedding, so note what changed since.
- **From a nightly export:**
  - Download the artifact from the Nightly run.
  - Run `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:<phrase> -in wedding-db-<date>.sql.gz.enc | gunzip > db.sql`.
  - Load it into a new database with `wrangler d1 execute <new-db> --remote --file db.sql`, check it, then point the Worker at it.
- **One couple's wedding only:**
  - Use their JSON backup (from their Backups folder or a download).
  - It holds the rows of each table, ready to re-insert into a fresh database. A rebuild tool for one wedding is still to be written. Until then, use Time Travel on a copy of the database.

## 2. Security workflow

### Every push (`.github/workflows/ci.yml`)
- Typecheck, lint, and every test, including:
  - `launch.security.test.ts`: two weddings, and every way one could reach the other's data. It covers ids in paths and bodies, shared features (vendor directory, email intake, photos, SMS), sessions and invites, privilege, enumeration, injection, and backups.
  - `launch.fuzz.test.ts` and `launch.scale.test.ts`: bad input on every route, and load.
- No couple-specific text in app code, and no committed secrets.
- `pnpm audit` for known-vulnerable runtime dependencies.

### Every night (`.github/workflows/nightly.yml`)
- The dependency audit and the secret scan, run again (new weaknesses are published daily).
- The security tests, run against the latest code.
- A check that the live site still sends its protective headers (HSTS, CSP, nosniff, referrer policy).

### How data is kept apart
- Every admin route checks membership of that wedding (owner, editor or viewer) before it reads anything.
- Guest links, party sign-ins, helper links and the photo QR code each reach only their own wedding.
- The shared vendor directory holds no wedding ids or names:
  - It shows how many couples booked each vendor.
  - It shows a price range only once three *other* weddings have prices, one figure per wedding.
  - A couple's own vendors are placed at their area's middle, never at their venue.
- Secrets are sealed or hashed:
  - Passcodes: PBKDF2.
  - Sessions: HMAC.
  - Storage keys: AES-GCM.

### If something goes wrong
1. **A secret leaks** (an API token, `SESSION_SECRET`, the SMS key):
   - Roll it with the provider.
   - Update the GitHub secret, then re-run the deploy.
   - Rolling `SESSION_SECRET` signs everyone out and changes photo QR codes, so reprint table cards if it happens after they're printed.
2. **An account is compromised:**
   - Change its passcode (this signs out its other devices).
   - Remove it as a member (this ends its sessions at once).
   - Check the Audit list for what it did.
3. **Data was changed or deleted by mistake:**
   - Use Time Travel to the minute before.
   - For one wedding only, use their backup (see the restore drill above).
4. **A security hole is found:**
   - Write the attack as a test (`it.fails` while open).
   - Fix it, and turn the test into a normal `it`.
   - Note it in `docs/LAUNCH_READINESS.md`.

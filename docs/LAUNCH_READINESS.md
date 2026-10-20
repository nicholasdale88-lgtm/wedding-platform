# Launch readiness

Status on 20 Oct 2026: every automated check passes (CI #247). This page covers what was tested, what broke and was fixed, what's still open with its strategy, and what only you can do before going live.

## 1. What was tested

The tests run automatically on every change (GitHub Actions), on a real copy of the database, with only the SMS provider and the clock faked.

### Scale (`apps/api/test/launch.scale.test.ts`)

| Scenario | What it does | Result |
|---|---|---|
| Large wedding | 4 events (wedding, after-wedding brunch, welcome drinks, birthday), 300 invitations, 700 people imported. About 92% reply with random answers and 15% change them. Overview and Insights figures are checked against the database. | Passes |
| RSVP storm | 100 replies at once; one guest answering twice at once; rate limits; 9 kinds of bad input; replies closing (late changes refused, first replies still allowed, the couple can still correct). | Passes |
| Planner at its maximum size | 300 tasks with 40 helpers; 300 budget lines; 200 vendors, each with 12 quotes and 12 payments. Stale saves are refused. Insights, Needs you, the calendar feed and reminders each answer in under 5 seconds. | Passes, after a fix |
| Texts | 300 guests with a daily cap of 100. Quiet hours hold. Five repeat runs and three overlapping runs never send anything twice. | Passes |
| Wedding party portal | 20 members sign up at once. Permissions work, 5 wrong passwords lock an account, resets end old sessions, and "sign-in needed" blocks plain links. | Passes |
| Helpers | 40 helpers tick 160 tasks at once. No save is lost and the totals match. | Passes, after a fix |
| Payment reminders | 200 vendors' payments, and over 300 due at once: exactly one text, never repeated. | Passes, after a fix |
| Email intake | 100 emails: repeats, 1 MB bodies, foreign characters, HTML only, quotes with PDFs, broken ones. Duplicates are stored once and nothing crashes. | Passes |

### Break-it (`apps/api/test/launch.fuzz.test.ts`)

| Scenario | What it does | Result |
|---|---|---|
| Hostile input | All 163 routes, every method, sent no body, garbage, arrays, 2 MB bodies, 100k-character fields, emoji, `<script>`, SQL injection, null bytes and prototype pollution. | No crashes, after the fixes |
| Who may do what | No cookie, a forged cookie, a viewer member, and the owner of another wedding. | All refused correctly. The other wedding's data is untouched (checked with a database fingerprint). |
| Private links | Wrong, short and other-wedding keys on: guest links, the party portal, helpers' lists, the coordinator link, the calendar feed and the live wall. | All refused |
| Login limits | Admin and party portal sign-in. | Both stop guessing (429) |
| Secrets | Passwords, session ids and invite/reset hashes, searched for in every response. | Never sent |

## 2. What broke, and is fixed

**Vendors and money**
- A full vendor list couldn't be saved, because of a 100 KB request limit. The limit is now just under the database's 2 MB per document.
- The vendor finder crashed on odd category names.

**Texts, sign-ins and links**
- Payment reminders re-texted once more than 300 payments were due.
- Helpers shared one wedding-wide save allowance; each helper now has their own.
- Viewer members could see private links (coordinator, calendar feed, helpers' keys, share-a-preview).
- The party portal could fall back to a public secret if the server's secret was missing. It now refuses to run without one.
- The calendar feed's rate limit could be used up by a stranger. It's now per network.

**Everyday use**
- Double-tapping "Invite", "Permissions" or "Add event" caused an error.
- Saved settings were read in ways that could crash on bad stored data.
- A save sent with a bad version number wasn't rejected.
- An unusual letter in a dietary note could crash a reply.
- Two calendar entries could clash between vendors.
- A refused guest import didn't give a message.

**Earlier in the review**
- Budget counted a booked vendor twice.
- "Book them" booked at $0.
- Un-ticking a payment wiped partial payments.
- Previews acted as a real guest.
- The photo page offered events a guest isn't invited to.
- The party settings panels tripped over each other.

## 3. Still open, and the strategy for each

| # | Risk | How likely | Strategy |
|---|---|---|---|
| 1 | Two text runs overlapping could slightly exceed the daily cap. The cron runs every 15 minutes, so a run would have to last over 15 minutes. | Very low | The provider's own daily limit is the backstop. Fix after launch by claiming texts atomically (one UPDATE … RETURNING). |
| 2 | The same email delivered twice at the same instant can leave an extra copy of an attachment in storage. | Very low | Harmless (storage only). Fix by inserting the email row before saving attachments. |
| 3 | Overview and Insights count "catering" slightly differently: the reply's head count vs. the people listed. | Medium | Pick one definition (the reply's head count) and use it in both. A small change. |
| 4 | Two first replies from one guest at the same second after replies close are both accepted. | Very low | Acceptable. |
| 5 | On phones, "Scroll for details" can sit under "Message us" and "Music on". | Medium | Raise the cue when those buttons show. This is in the invitation design file, so change the design and regenerate. |
| 6 | Desktop and laptop look of the guest pages. | Unknown | The live laptop view was checked and looks right. Please point to what looked wrong so it can be fixed exactly. |
| 7 | A real phone hasn't been tested on the admin, because it needs your sign-in. | Medium | You do one pass on your phone. List anything odd and it gets fixed the same day. |

## 4. Only you can do these (before going live)

1. **Domain**
   - Buy it (about A$15–25 a year).
   - Add it in Cloudflare Pages → Custom domains.
   - Set `PUBLIC_BASE_URL` to it.
2. **Texts**
   - Top up SMS credit.
   - Set your sender name and your own mobile in Account → Settings → Texting.
   - Send yourself a test.
3. **Email intake**
   - Cloudflare → your domain → Email Routing: switch it on.
   - Route the event address to the `wedding-api` Worker.
4. **Photo, video and file storage (free)**
   - Register the free app keys with Google, Dropbox and Microsoft. The steps are in Photos → Linked storage.
   - Add the keys as GitHub secrets.
   - Big files then go to each couple's own storage, not yours.
5. **Secrets**
   - Check that `SESSION_SECRET` is set (a long random value). Sign-in and the party portal depend on it.
6. **Workers AI**: optional; the assistant and quote reading need the API token permission.
7. **A real run-through on your phone**
   1. Sign in.
   2. Add a guest.
   3. Open their link.
   4. Reply.
   5. Check the reply in Overview.
   6. Add a vendor, book it and mark a payment paid.
   7. Invite one bridesmaid to the portal.
   8. Install the admin to your home screen.
8. **Backups**: download one from Account → Settings → Backup the day you go live, then weekly.

## 5. Running cost (low-cost operator)

- **Cloudflare free plans** cover the site, the server code and the database: 5 GB of data, and 100,000 requests a day.
- **Storage**: photos, videos, quotes and signs go to each couple's own Google Drive, Dropbox or OneDrive. Only small thumbnails stay with you.
- **What you actually pay for**:
  - The domain.
  - SMS credit, a few cents per text.
  - Optionally, the App Store later (US$99 a year).

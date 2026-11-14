# Growing with demand: storage, limits and costs

Written 15 Nov 2026. Prices are Cloudflare's own, in US dollars (about A$1.55 to US$1). Check
developers.cloudflare.com/workers/platform/pricing and /d1/platform/limits before relying on them.

## Where things are kept

| What | Where | Who pays |
|---|---|---|
| Guests' photos and videos | The couple's own Google Drive, Dropbox or OneDrive (a folder the site makes) | The couple (their own storage) |
| Daily backups of each wedding | The same linked storage | The couple |
| Planning files (quotes, contracts) | Linked storage too, when connected | The couple |
| Everything else (guests, replies, seating, the planner, messages) | Cloudflare D1, about 1 to 10 MB per wedding | Us, within the plan |

This is by design and is said on the sales page (Deluxe plan card and the FAQ "Where are our photos kept?")
and in the Privacy policy. **Leave Cloudflare R2 switched off**: with it on, photos would also be copied to the
site and we'd pay for storage (US$0.015 per GB a month past 10 GB, about 2 GB per wedding).

## The limits that matter, and when we reach them

| Limit | Free plan | Workers Paid (US$5 a month) | When we reach it |
|---|---|---|---|
| Database reads per cron run | 50 | 1,000 | The 15-minute timer needs about 10 a wedding: past ~4 active weddings on Free |
| Database size | 500 MB | 10 GB | About 1,000+ weddings at 1 to 10 MB each |
| Requests | 100,000 a day | 10 million a month included | Hundreds of weddings in their busy weeks |

**Do this first: Workers Paid, before launch.** It's the one upgrade that matters. On the free plan, the
timer can only look after a handful of weddings each run.

## What the site does to stay ahead

- **The timer only looks at weddings with something to do**: a dated message due within two days, texts
  or emails waiting, or automatic messages switched on before the wedding is more than 30 days past. Past
  and empty weddings cost nothing. The urgent ones go first, up to 40 a run (`CRON_WEDDINGS` in
  sms/engine.ts); the rest take turns.
- **Company portal → Overview → Capacity** shows weddings, active weddings, database size and the timer's
  last run, with one of three verdicts: All good, Plan ahead or Do this week. It says when to upgrade.
- **Owner jobs** that only you can do (accounts, keys, upgrades) are on the to-do list on the same page.

## The next steps as demand grows (in order)

1. **~5 active weddings:** Workers Paid (US$5 a month). On the to-do list.
2. **~160 active weddings** (the Capacity card says when): move the timer to **Cloudflare Queues**, so each
   wedding runs on its own with its own limits. Queues come with Workers Paid (1 million operations a month
   included). Ask Claude; it changes only the cron.
3. **Database past 7 GB:** archive weddings that finished over a year ago. Their data goes to the couple's
   linked storage as a file and is removed from the database. Ask Claude.
4. **Many thousands of weddings a year:** split the database by year. This is a bigger job, but nothing
   else changes.

## The maths

| Weddings a year | Revenue (~$88 each) | Cloudflare | Texts |
|---|---|---|---|
| 50 | ~$4,400 | US$5 a month | Paid by couples (credits, ~3c margin each) |
| 600 (the $50k goal) | ~$53,000 | US$5 a month, plus a few dollars of Queues | as above |
| 5,000 | ~$440,000 | ~US$20 to 50 a month | as above |

Because photos stay in couples' own storage, hosting stays under 0.2% of revenue at every size.

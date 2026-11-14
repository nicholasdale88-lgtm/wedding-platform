# The Yes List: growth plan

What to change, and when, as the number of weddings grows. Each section says what triggers the change, what it costs and how much work it is. Marketing is covered in [MARKETING_LAUNCH.md](MARKETING_LAUNCH.md) and the Facebook ads plan in [FACEBOOK_ADS_PLAN.md](FACEBOOK_ADS_PLAN.md). Launch set-up is in [GO_LIVE.md](GO_LIVE.md).

## 1. Email

### How it works today
- Every wedding gets its own address (`<web-address>@<your domain>`), and the couple can choose a different one in the app.
- **Incoming mail:** Cloudflare Email Routing, a catch-all rule to the Worker. It's free and unlimited at every stage, and never needs to change.
- **Outgoing mail:** Resend. The free plan allows 3,000 emails a month, and its **100 a day is shared by every wedding**. So the app caps each wedding at 40 emails a day (`MAIL_PER_DAY` in `apps/api/src/lib/weddingMail.ts`). Emails over the cap wait in the queue and go the next morning; nothing is dropped.
- Every email goes out through one function, `sendEmail` in `apps/api/src/lib/email.ts`. Changing provider means changing that function only. Couples' addresses, inboxes and replies stay the same.

### How many emails a wedding sends
These figures are estimates. A wedding with about 150 guests sends roughly **600 to 900 emails** over its life: save-the-dates, invitations, reminders, thank-yous, night-before guides, replies and inbox copies. Most of them go out in bursts. The tables below use about 850 per wedding.

### The stages

| Stage | Trigger | Outgoing email | Cost (check current prices) |
|---|---|---|---|
| **A. Launch** | Up to ~3 paying weddings active at once | Resend free | $0 |
| **B. Early growth** | ~3–5 weddings active at once, or invitations regularly queueing to the next day | Resend Pro (50k a month, no daily limit) | ~US$20/month (≈ one $88 sale) |
| **C. Busy** | Over ~50k emails a month (~700 weddings a year) | Resend Scale (100k) **or move to Amazon SES** | Resend ~US$90+/month; SES ~US$5/month |
| **D. Large** | Over ~150k emails a month | Amazon SES | ~US$0.10 per 1,000 emails |

Rough monthly cost by size:

| Weddings a year | Emails a month (approx.) | Resend | Amazon SES |
|---|---|---|---|
| 50 | ~4k | Free–$20 | under $1 |
| 500 | ~35k | ~$20 | ~$4 |
| 2,000 | ~140k | ~$90+ | ~$14 |
| 10,000 | ~700k | several hundred | ~$70 |

**Recommendation:** stay on Resend through stages A and B, because it's already built in and simple. Move to Amazon SES at stage C, once its savings outweigh the extra set-up work.

### Things to do at each stage
- **Now (before launch):** send from a subdomain such as `mail.<your domain>`, and add SPF, DKIM and DMARC records in Cloudflare. Every wedding sends from your one domain, so if one couple's emails get flagged as spam, every couple's emails can start landing in junk. The subdomain keeps your main domain's reputation separate.
- **Stage B (paid Resend):** raise the per-wedding daily cap, which exists only because the free plan is shared. *To build:* the cap rises automatically when a paid plan is set.
- **Stage C:** move outgoing mail to Amazon SES. This needs:
  - an AWS account
  - a request to leave the SES "sandbox" (AWS reviews it, usually in a day or two)
  - the domain verified in SES (DNS records in Cloudflare)
  - bounce and complaint reports sent back to the app, so it stops emailing bad addresses

  *To build:* make the email provider a setting, so the move is only a matter of adding keys.
- **Stage D:** think about a dedicated sending IP (SES offers one for about US$25/month), and watch bounce and complaint rates weekly in the Company portal.

### A premium extra: the couple's own domain
A couple could send from their own domain (`hello@sophieandnick.com`) instead of yours. Resend and SES both support it: the couple adds a few DNS records, and the app checks them. Today the app sends under their names from your domain, with replies going to their address. *To build* when there's demand. It could be a paid add-on.

## 2. File storage (photos, videos, planning files)

### Two kinds of storage
- **The app's own storage: Cloudflare R2.** Guest photo uploads, videos (up to 55 MB each), the live photo wall and table QR photos all live here. It's in the same Cloudflare account as everything else, so there's nothing new to sign up for. It needs a card on the Cloudflare account to switch on, and isn't on yet.
- **The couple's own storage (optional):** couples can link their own Google Drive, Dropbox or OneDrive, and the app files albums, planning documents and daily backups there. For you, this means storage the couple pays for, not you. Each provider needs a free "app key" from that provider's developer site.

### Cost of R2 (check current prices)
- 10 GB free each month, then about **US$0.015 per GB a month**. **No download fees**, which matters for a photo wall viewed by 150 guests.
- These figures are estimates: about 2–4 GB per wedding with videos. 100 weddings holding photos ≈ 300 GB ≈ **US$4.50/month**. 1,000 weddings ≈ 3 TB ≈ **US$45/month**.
- *To decide later:* how long photos are kept after the wedding (e.g. 12 months, then a reminder to download or link their own storage). That keeps the bill flat as the number of weddings grows.

### Do you need a Microsoft account?
**No, not for running the business.** Hosting, database, storage and backups are all Cloudflare plus GitHub. Gmail is fine for your own mail, and your business address (`hello@<your domain>`) can forward to it free through Cloudflare Email Routing.

A Microsoft account is needed only to offer **"Link OneDrive"** to couples. The app key comes from a free Microsoft Entra app registration. That's worth doing only once couples ask for OneDrive. Google Drive is the one most couples will use, so set up its key first, then Dropbox.

| Stage | Storage | Cost |
|---|---|---|
| Launch | Switch R2 on (card on Cloudflare). Google Drive app key for couples who want their own storage. | $0 (within 10 GB) |
| ~100 weddings | R2 as is; set the keep-for-12-months rule | ~US$5/month |
| ~1,000 weddings | R2 as is; add Dropbox and OneDrive keys if couples ask for them | ~US$45/month |

## 3. Next sections to add
- Texts (SMS): cost per wedding as volume grows, and when to move to a cheaper rate.
- Hosting and database: when Cloudflare's free tier runs out (~US$5/month Workers Paid).
- Support: when one person can no longer answer every email.

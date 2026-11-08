# Going live: what's left to set up, and what it costs

Everything here is yours to do: it needs your identity, your card or your passwords, so the app can't do it for you. Work down the list in order. Each step says what it costs, and the total is at the bottom.

## 1. Business basics (this week)

| Step | Where | Cost | Why |
|---|---|---|---|
| **ABN** (sole trader) | abr.gov.au → Apply for an ABN | **Free** | You're running a business. You need it for a .com.au domain, Stripe, and registering the business name. |
| **Business name "The Yes List"** | ASIC Connect (asic.gov.au) | **$45 for 1 year** (or $104 for 3) | Required to trade under a name that isn't your own. Check it's free to use first. |
| **Business bank account** (optional but wise) | Your bank | Usually **free** | Keeps the money and the tax clean. Stripe pays into it. |
| **GST** | Not yet | **$0** | Only required once sales reach **$75,000 in 12 months**. The app warns you from $60,000 (Company portal → Money & tax). Until then, don't charge or mention GST. |

**Tax, in plain terms:** as a sole trader, profit is added to your income and taxed at your normal rate. Nothing is withheld for you. Company portal → **Money & tax** shows the profit each quarter and how much to move to a savings account (30% by default; your accountant can tell you the right figure). The ATO may ask for quarterly instalments after your first tax return. The spreadsheet button gives your accountant every sale and expense. *This is general information, not tax advice; check your situation with an accountant.*

## 2. The domain (needed for email and your own address)

| Step | Cost |
|---|---|
| Buy the domain. A **.com.au** needs your ABN (VentraIP, Crazy Domains, etc.); a **.com** can be bought at cost at Cloudflare. | **About $15–25 a year** |
| Point it at Cloudflare (free): add the site in Cloudflare, then change the domain's nameservers. | Free |
| Follow docs/SETUP_ACCOUNTS.md → "Moving to your own domain". Nothing is lost: the old address keeps working. | Free |
| **Email Routing** in Cloudflare: a catch-all to the Worker. This gives every wedding its own address. | Free |

## 3. Getting paid: Stripe

1. Sign up at stripe.com as a sole trader with your ABN, licence and bank account: **free**, no monthly fee.
2. Fees: **1.7% + 30c per Australian card** (about $1.32 on a $60 sale). Payouts go to your bank automatically: the first after about a week, then daily.
3. In Stripe: Developers → API keys (the **secret** key), and Webhooks → add `https://<your site>/api/hooks/stripe` for the event `checkout.session.completed` (gives the **signing secret**).
4. Add both in GitHub → Settings → Secrets → Actions: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The next update switches card payments on.
5. Optional: make a Payment Link for each plan and paste them in Company portal → Settings → Payment links, for couples who ask.

## 4. Email: Resend

1. Sign up at resend.com: **free for 3,000 emails a month (100 a day)**.
2. Add and verify your domain (Resend shows the DNS records; add them in Cloudflare).
3. Add GitHub secrets `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `The Yes List <hello@your-domain>`), and the variable `INBOX_DOMAIN` (your domain).
4. Later, when more than about 100 emails go a day: Resend Pro is about **US$20 a month**.

## 5. Text messages: Mobile Message

- Prepaid credit, about **2c a text**. Start with **$20–50**.
- Couples' texts cost about $10–15 per wedding. The price is "at cost", so add a margin later if you like.

## 6. Free accounts for marketing (one evening)

All of these are free:
- Google Business Profile and Google Search Console (send the sitemap);
- Meta Business Suite (Facebook page and Instagram);
- TikTok, Pinterest Business, YouTube;
- Canva and CapCut for videos.

The plan is in docs/MARKETING_LAUNCH.md and docs/FACEBOOK_ADS_PLAN.md.

## 7. Before you announce it (a checklist)

- [ ] Sign up as a test couple on the live site; send yourself an invitation; reply; pay with a real card (refund it in Stripe).
- [ ] Your own wedding and the 30th look right on the live site.
- [ ] Company portal → Settings: support email, social links. Promote: a launch code (YES20) and the banner.
- [ ] Privacy and Terms pages read correctly, with your business name and ABN.
- [ ] Check the 12-hourly backup ran (GitHub → Actions → Nightly).

## What it costs

| | First year | After that |
|---|---|---|
| ABN | $0 | $0 |
| Business name | $45 | $45 a year |
| Domain | $15–25 | $15–25 a year |
| Hosting, database, backups (Cloudflare, GitHub) | $0 | $0 until you outgrow the free tiers (then about US$5 a month) |
| Email (Resend) | $0 | $0 up to 3,000 a month |
| Payments (Stripe) | $0 up front | 1.7% + 30c per sale |
| Texts (prepaid) | $20–50 | Covered by couples' use |
| Ads (optional test) | $0–280 | Only if the test pays (see the ads plan) |
| **To launch** | **about $80–120**, plus any ad test | |

Optional later: register the trademark "The Yes List" with IP Australia, about **$250 per class** (class 9 software and class 42 online services, so about $500). It's the strongest protection for the name (see below).

## Protecting your ideas

- **Copyright is automatic:** your code, designs, wording, videos and help guides are yours. The code stays in a **private** GitHub repository; keep it that way.
- **The name and logo:** a registered trademark (above) stops others using "The Yes List" for the same kind of service. It's the one protection worth paying for early.
- **Features and ideas** can't be owned in Australia (software patents are rare, slow and expensive, around $10,000+), so don't spend there. Your real protection is speed (shipping what couples ask for every week), your brand, your partners and your reviews.
- **Terms of use:** they forbid copying, scraping or reverse-engineering the app. The site already sends "noindex" on private pages and rate-limits everything, which makes copying harder.
- Ask staff and contractors to sign a simple agreement that what they make for The Yes List belongs to the business, and that ideas and customer details stay confidential.

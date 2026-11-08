# The Yes List: improvement plan

How the app grows after launch, a little at a time. Every change goes to **staging** first (docs/STAGING.md), then live. Updates never touch couples' data: CI refuses any database change that would remove or rewrite rows unless it is proven safe. Backups run every 12 hours.

The rule for choosing what comes next:
1. What paying couples ask for most (Company portal → Feedback).
2. What raises free → paid.
3. What costs nothing to run.

Each item is sized for a week or less.

## Now: launch week (November 2026)

- [x] New front page: the envelope opening on a phone, cost comparison, "Send it free".
- [x] Company portal: staff roles, payment-link workflow, feedback, activity log, brand look.
- [x] Backups every 12 hours; a CI guard against data loss; staging copy of the site.
- [ ] **Owner:** buy the domain, set up Stripe, Resend and the free accounts (see the cost list in the launch notes).
- [ ] Wedding email address (send free, replies in the app, copies to Outlook or Apple Mail). Built; switches on once the domain is set up.
- [ ] Draft seating before guests reply.
- [ ] Meta Pixel and Conversions API: sign-up and purchase events, so ads can be measured (docs/FACEBOOK_ADS_PLAN.md).

## Month 1: turn visitors into paying couples

| Feature | Why |
|---|---|
| Reviews and "weddings planned" count on the front page | Social proof; ask the first paying couples for one line each |
| Upgrade moments in the app ("Send by text" and "Seat 120 guests" open the upgrade with the price) | Free → paid happens where the need is felt |
| Card payment on by default (Stripe Checkout already built; needs the keys) | No waiting for a payment link |
| Launch offer automation: banner and code from Boxing Day to Valentine's Day | Engagement season |
| Onboarding email series from the wedding address (day 1, 3, 7: "send your save-the-dates", "try seating") | Free users come back and upgrade |
| Referral reward: give a friend 20% off, get a free extra event | Couples know other engaged couples |

## Month 2: features couples feel

| Feature | Why |
|---|---|
| Save-the-date as its own animated card | First thing couples send, often 12 months out |
| More invitation designs (5 new themes, seasonal) | The visual reason people choose us |
| Budget purchase log (favours, suits, signs, odds and ends) with receipts photo | Asked for |
| Savings tracker: who contributed what, running total | Asked for |
| Music playlist import and export (Excel) | Asked for |
| On-the-day set-up jobs: who sets up what, by when | Asked for |
| Thank-you card tracker after the wedding | Keeps couples in the app after the day |

## Month 3: reach and retention

| Feature | Why |
|---|---|
| Better vendor finder (more listings, reviews, "near your venue") | The directory brings vendors, and vendors bring couples |
| Partner portal for celebrants and venues: their code, couples sent, rewards | The cheapest paying channel |
| Birthday, engagement and hens/bucks invitations from a wedding account | Extra-event add-on revenue ($39) |
| Guest photo album book export (PDF to print) | Paid add-on |
| Upgrade zod to v4, remove the advisory exception | Housekeeping |

## Later: bigger moves

- **Worldwide:** currencies, international phone numbers, time zones, an SMS provider per country, then New Zealand, the UK and the US.
- **Website builder** for the wedding (story, travel, registry) on its own address.
- **Couples' app** in the stores (the web app already installs to the home screen).
- **AI helper:** "write our invitation wording", "draft our run sheet", "seat these 120 people the way we'd like".
- **Vendor marketplace payments** (vendors pay to be featured), once there are enough couples.

## How we decide and ship

1. **Feedback tab:** Support moves each item New → Planned. The note written there shows to every couple under "Coming from your feedback".
2. **A developer takes it** (In progress), builds it on the `staging` branch and checks it at the staging address.
3. **Merge to main:** it goes live. CI runs every test, the data guard and a security scan first. A restore point is taken before every deploy.
4. **Mark it Done:** couples see it shipped. Tell them on social media too.

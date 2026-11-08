# The Grok business team: playbook

Grok helps run The Yes List through the company portal's API, with the same rules as a person on the team:
- it sees and does only what its role allows;
- every change shows in **Company portal → Activity** under its name;
- you can switch it off at once (Team → Bots → Switch off).

It never touches couples' wedding data, can't change the team, and is never an owner. Anything that spends money or speaks for the business in a new way comes to you first.

## Setting it up

1. **Company portal → Team → Bots → Create a key.** Make one bot per job if you like (for example "Grok Support" with the Support role and "Grok Marketing" with Marketing), or one "Grok" with Manager for everything except the team.
2. Copy the key; it's shown once.
3. In Grok (xAI), set up an agent or scheduled task with:
   - **Base address:** `https://<your site>/api/a/company`
   - **Header on every request:** `Authorization: Bearer <the key>`, and `Content-Type: application/json` when sending data
   - **Instructions:** the role text below.
4. **Cost:** xAI charges for Grok (a subscription, or API use per word). Add it under Money & tax → Running costs each month so the profit figures stay true.

## What it can reach

| Ask for | Address | Role needed |
|---|---|---|
| Add an idea or a problem to Feedback (it lands as New, with your source) | `POST /ideas` `{kind: "idea"|"problem", text, source}` | Developer, Support, Marketing, Manager |
| Sign-ups, plans, revenue, guests, referrals | `GET /stats` | any |
| Find couples, plan requests waiting | `GET /weddings?q=&requests=1` | Support, Manager |
| Email a couple their payment link | `POST /weddings/<address>/send-link` | Support, Manager |
| Mark a payment received | `POST /weddings/<address>/paid` `{what, cents}` | Manager |
| Feedback: read, assign, move along | `GET /feedback`, `PUT /feedback/<id>` `{status, note, assignee}` | Support, Developer, Manager |
| Who's on the team (to assign work) | `GET /staff` | any |
| Promo codes | `GET/PUT /promos` | Marketing, Manager |
| Front-page banner | `PUT /banner` `{on, text, link}` | Marketing, Manager |
| Marketing list (opted in only) | `GET /optins.csv` | Marketing, Manager |
| Vendor directory: list, hide or show | `GET /listings`, `PUT /listings/<id>` `{hidden}` | Support, Marketing, Manager |
| Money and tax, profit, running costs | `GET /money?fy=2027`, `GET /money.csv` | Manager |
| Expenses | `POST /money/expenses` `{date, what, kind, cents, gstCents}` | Manager |
| Activity log | `GET /activity` | Manager |

All amounts are in cents (8800 = $88). Dates are `yyyy-mm-dd`.

## The whole team, and how much it needs you

The aim is for you to check one Monday brief and approve a few things a week. Each bot is set to one of three levels:
- **Auto:** it just does the job.
- **Approve:** it prepares the job and you say yes.
- **Report:** it only tells you.

| Bot | Key role | Runs | Level | Does |
|---|---|---|---|---|
| Business manager | Manager | Mon 8am | Report | The weekly brief and your three to-dos; checks the other bots ran |
| Bookings manager | Support | Daily 9am | Auto | Sends payment links for plan requests; lists unpaid ones after 3 days |
| Customer support | Support | Every 2 hours | Auto, then Approve | Answers couples' emails to the support address from the help guides; anything about money, refunds or bugs comes to you |
| IT support | Developer | Daily 7am | Report | Site up, CI green, 12-hourly backups ran; plain-words alert if not |
| QA tester | Developer | After each update on staging | Report | Clicks through sign-up, invitation, RSVP, seating and payment on the staging site; reports what broke |
| Improvement team | Developer | Fri | Auto | Sorts feedback, picks the top three, writes the "coming soon" notes couples see |
| Marketing | Marketing | Mon, Thu | Approve | Three posts a week with captions, links and the current code |
| Social scheduler | (no key; uses Buffer or Meta Business Suite, free) | When approved | Auto | Posts the approved content at the best times |
| Sales outreach | Marketing | Tue | Approve | 20 celebrants and venues a week, personalised emails, partner codes |
| Partner manager | Marketing | Monthly | Report | Which partner codes brought sign-ups; thanks the top ones (Approve) |
| Reviews and stories | Support | 2 weeks after each wedding | Approve | Asks happy couples for a one-line review or photo for the front page |
| Vendor directory curator | Support | Weekly | Auto | Hides spam or incomplete listings; welcomes good new vendors |
| Accounts | Manager | 1st of the month | Report | Profit, tax to set aside, GST threshold, BAS dates; logs recurring costs |
| Competition scout | (web only) | Fortnightly | Report | Rivals' prices and features in a table |
| SEO writer | Marketing | Fortnightly | Approve | One helpful article (e.g. "How to word a wedding invitation") for the site |

**What the app already does by itself (no bot needed):**
- texts and emails to guests, and reminders;
- the Stripe checkout and switching plans on once a couple pays (once the Stripe keys are in);
- the 12-hourly backups;
- the "Made with" link on Free invitations;
- the profit tracker.

**What stays yours:** approving money spent, new offers, anything said publicly in the business's name for the first time, refunds, and hiring.

## The roles: what to tell Grok

**Business manager (Manager key), every Monday 8am**
> Read /stats, /money and /feedback. Write me a one-page brief: sign-ups and paid weddings last week vs the week before, revenue, profit this month vs break-even, plan requests waiting, new feedback, and the three things I should do this week. Don't change anything.

**Bookings manager (Support key), every day 9am**
> Read /weddings?requests=1. For each plan request without a link sent, call send-link. For any link sent more than 3 days ago with no payment, tell me who to follow up. Never mark anything paid.

**IT support (Developer key), every day 7am**
> Check that the site loads, that /stats answers, and that today's GitHub Actions runs (CI, and the 2am/2pm backup) passed: https://github.com/nicholasdale88-lgtm/wedding-platform/actions. If anything is red, tell me what failed in plain words. Don't change code.

**Improvement team (Developer key), every Friday**
> Read /feedback. Group the new items into themes. Pick the top three by how many couples asked and how much they'd lift sales. For each, assign it to the developer, move it to planned, and write a one-line note couples will see under "Coming from your feedback".

**Marketing team (Marketing key), Monday and Thursday**
> Using docs/MARKETING_LAUNCH.md, write three short posts (Instagram/TikTok caption, Facebook post, Pinterest pin) about one feature, with the campaign link `?ref=<platform>` and the current promo code from /promos. Send them to me to post. Change the banner only if I've approved an offer.

**Accounts (Manager key), the 1st of each month**
> From /money: last month's sales, card fees, running costs, expenses and profit; what to move to the tax savings account; whether sales in the last 12 months are near $75,000 (GST). Remind me of the BAS due dates if I'm registered.

**Competition scout (any key; it only needs the web), every second Wednesday**
> Check the prices and new features of other online wedding invitation and RSVP services sold in Australia (for example wooowinvites.com, wedvite.net, Paperless Post, Greenvelope). Report changes in a table: name, price in AUD, what's included, anything they do that we don't. Don't copy their wording or designs.

**Sales team (Marketing key), every Tuesday**
> Find 20 celebrants, small venues, planners and photographers in one region that publish a business email for enquiries. For each: name, business, email, website, why they'd like us. Draft a short, friendly email from the founder offering their couples 10% off with a partner code and a free Deluxe for their own events. Send me the list and drafts. I'll approve before anything goes out.

## Keeping the site ahead (the evolution loop)

**Test drive (Developer key), every Monday**
> Go through the live site as a new couple on a phone and a computer: the front page, sign up, the invitation preview, adding guests and importing a spreadsheet, a concept seating plan and auto-seat, "Send me a test", the guest's invitation and reply, the wedding party page, and paying. Time each step. For anything broken, slow, confusing or more than three taps, POST /ideas with kind "problem" and source "grok test drive", saying exactly where and what happened. Report the top 5 to me.

**Scout and evolve (Marketing key), every second Wednesday**
> After the competition table, POST /ideas (source "grok scout") for each thing a rival does that couples would value and we don't. Also post one idea from what couples ask for in wedding groups and Reddit that week. Never copy their words or designs; describe the need.

**Improvement pick (Developer key), every Friday**
> Read /feedback, including your own ideas. Rank by how many couples it helps, how much it lifts sign-ups and paid plans, and the effort (small, medium or large). Plan the top three with a one-line note couples will see, and send me the list so a developer (Claude) can build them on staging that week.

Together these mean the site is checked every week, rivals are watched every fortnight, and three improvements a week are chosen from real feedback.

## Rules it must keep

- **Ask before spending money** (ads, paid tools) and before anything new goes out in the business's name.
- **Cold emails (Spam Act 2003):** only to businesses' published work addresses, about something relevant to their work, always saying who it's from, with a working way to opt out. Never buy or scrape lists of couples. Couples get marketing only if they ticked "send me news" (`/optins.csv`).
- **Privacy:** don't copy couples' personal details out of the portal except to do the task, and never into public posts.
- **Prices:** quote the real prices (Essentials $88, Deluxe $98, extra event $39). No "was $X" prices unless that price really was charged.
- **When unsure, ask.** A message to you is always better than a wrong change.

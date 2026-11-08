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

All amounts are in cents (6000 = $60). Dates are `yyyy-mm-dd`.

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

## Rules it must keep

- **Ask before spending money** (ads, paid tools) and before anything new goes out in the business's name.
- **Cold emails (Spam Act 2003):** only to businesses' published work addresses, about something relevant to their work, always saying who it's from, with a working way to opt out. Never buy or scrape lists of couples. Couples get marketing only if they ticked "send me news" (`/optins.csv`).
- **Privacy:** don't copy couples' personal details out of the portal except to do the task, and never into public posts.
- **Prices:** quote the real prices (Essentials $60, Deluxe $80, extra event $39). No "was $X" prices unless that price really was charged.
- **When unsure, ask.** A message to you is always better than a wrong change.

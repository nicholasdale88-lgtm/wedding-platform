# The Yes List: Facebook and Instagram ads plan (small budget)

> **Prices changed on 8 Nov 2026 to A$88 (Essentials) and A$98 (Deluxe).** Read every "A$28" below as A$88. The break-even cost per purchase is now about **A$86** (A$69 with YES20), about three times the room the numbers below assume.

Written 8 Nov 2026 for the owner, who is not a marketer. Read the **honest bottom line** first, then follow the steps in order. Prices are A$. Nothing in the app has been changed yet: section 7 lists the tracking work still to do.

## 0. Honest bottom line

- A A$28 one-off product is **hard to make profitable with cold Meta ads**. The ads will probably cost **A$8–20 per free sign-up**. They pay for themselves only if **a large share of free couples upgrade (roughly 30% or more)**. This plan is a cheap, capped test that tells you that number before you spend more.
- In your favour: the Free plan stops at **50 guests**, and the average Australian wedding has about **97 guests** ([Easy Weddings](https://www.easyweddings.com.au/articles/what-do-wedding-invitations-cost)). That means most real couples have to upgrade. Every free wedding also sends a "Made with The Yes List" link to its guests, which is free promotion.
- **Recommended budget: A$10/day, capped at A$280 for the 4-week test.** Keep the money for scaling until Boxing Day to 14 Feb, when most Australians get engaged.

## 1. Benchmarks: what to expect (all uncertain)

| Metric | Realistic range for us | Source / note |
|---|---|---|
| CPM (cost per 1,000 views) | A$10–16 | AU about A$10.70–15.50 through 2025–26, roughly 20% below global ([Superads AU CPM](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/australia)) |
| CPC (cost per link click) | A$1.00–3.20 | AU average about A$1.00 ([Superads AU CPC](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/australia)); A$1.15–3.20 ([Advisible](https://advisible.com.au/?p=31316)) |
| Link CTR | 0.8–1.7% | Traffic campaigns average 1.71%; leads campaigns 2.59% ([LocaliQ 2025](https://localiq.com/blog/facebook-advertising-benchmarks/)) |
| Landing page to free sign-up | 5–15% | About 13% visitor to freemium in SaaS ([CrazyEgg / First Page Sage](https://www.crazyegg.com/blog/free-to-paid-conversion-rate/)). Mobile wedding traffic will probably be lower |
| Free to paid | 2–5% typical; **15–40% possible for us** | Freemium average 2–5% ([Phiture](https://phiture.com/mobilegrowthstack/how-to-determine-paywall-features-and-pricing-with-user-surveys/)). Ours could be much higher because of the 50-guest limit. Not proven |

These are generic third-party figures, not wedding-specific audited data. **Your own numbers after about A$150 of spend matter more than anything in this table.**

## 2. Break-even maths

The net amount per sale is after Stripe fees: Essentials A$27, Deluxe A$34, extra event add-on A$39 (about A$38 net). Assume 75% of buyers choose Essentials and 25% choose Deluxe. That makes the **blended net about A$29 per paying couple**. With the launch code YES20 (20% off), it is about **A$23**. Also subtract your SMS cost per paid wedding once you know it.

**Break-even cost per purchase (CPA) = about A$29 at full price, or about A$23 with YES20.** Aim for A$20 or less so the business makes some profit.

Break-even cost per **free sign-up** = blended net × the share of free couples who pay:

| Free → paid | Break-even per sign-up (full price A$29) | With YES20 (A$23) |
|---|---|---|
| 5% | A$1.45 | A$1.15 |
| 10% | A$2.90 | A$2.30 |
| 20% | A$5.80 | A$4.60 |
| 30% | A$8.70 | A$6.90 |
| 40% | A$11.60 | A$9.20 |

**How to read it:** if ads bring sign-ups at A$10 each, at least 35% of those couples need to pay.

**Ways to make ads pay:**
1. **Push Deluxe:** it is only A$7 more. Show it as the recommended plan on the sales page and in the upgrade card. Each Deluxe sale adds about A$7 of break-even room.
2. **Offer paying at sign-up:** sign-up already accepts `plan: essentials | complete`, so a couple can buy straight away and you are paid immediately.
3. **Suggest the extra event add-on (A$39)** to couples with an engagement party or rehearsal dinner. One add-on more than doubles the order.
4. **Prompt upgrades early:** send an email or in-app nudge when a free couple reaches about 40 guests or opens the seating plan or texts.

**Sign-ups or direct purchases?** Optimise for **sign-ups** (CompleteRegistration). At this budget Meta will never see enough purchases to learn from them, as section 4 explains. But **judge success on purchases**.

## 3. Targeting engaged couples (as of late 2026)

- Meta removed dozens of interest categories on 15 Jan 2026 ([adlibrary](https://adlibrary.com/posts/meta-interest-targeting-removed)). It also removed detailed-targeting exclusions in March 2025 ([Conversios](https://www.conversios.io/blog/meta-advantage-audience-vs-detailed-targeting-2026-guide/)). Third-party 2026 guides still list **Relationship status: Engaged** and the **"Newly engaged" (1 year / 6 months / 3 months) life events** ([Linear](https://lineardesign.com/blog/facebook-detailed-targeting-list-2024/)). **Type "engaged" into Ads Manager to check they appear for Australia before relying on them.**
- With **Advantage+ audience** (the default), your inputs are only *suggestions*. Location, minimum age, language and custom-audience exclusions are the only hard limits ([Meta developer docs](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/targeting-expansion/advantage-audience); [Jon Loomer](https://www.jonloomer.com/advantage-plus-audience-best-practices-guide/)). **On a tiny budget, the creative does most of the targeting:** a wax-seal envelope video finds couples by itself.
- **Lookalikes** need a seed audience of at least 100 people from one country. Upload your sign-up emails once you have 100 or more (Week 4 at the earliest).
- **Retargeting audiences** (site visitors, people who watched 50% of a video) will be small for weeks. Meta struggles to deliver to audiences under about 1,000 people. Retarget free couples by **email and in-app first** (free), and add a retargeting ad set only once the pool reaches 1,000 or more.

## 4. Campaign setup in Ads Manager (step by step)

**Before you start:** do the tracking work in section 7 and check it with Events Manager → Test events.

1. **Create → Sales** objective. Leave Advantage+ campaign budget on and choose **Manual** (not "Advantage+ sales") so the settings below stay as set.
2. **Conversion location:** Website. **Performance goal:** maximise conversions. **Conversion event:** **CompleteRegistration**.
3. **Budget:** **A$10/day** on the campaign. No cost cap or bid cap.
4. **Audience:** Location = Australia, Minimum age = 21. Under Advantage+ audience suggestions, add Engaged / Newly engaged (if available), and interests such as Wedding, Bridal shows, Engagement ring, Wedding dress. **Exclude** a customer list of current paying couples (export from Company portal).
5. **Placements:** Advantage+ placements. After A$50 of spend, check Breakdown → Placement. If Audience Network brings clicks but no sign-ups, remove it.
6. **Ads:** 4 ads in **one ad set** (concepts A–D), each a **9:16 video** (Reels and Stories) with a 4:5 crop for Feed. Turn on captions. Turn off "Advantage+ creative enhancements" that add music or change the text.
7. **Website URL:** `https://<your-domain>/?ref=meta&utm_source=meta&utm_campaign=launch&utm_content=A` (change A to B, C or D for each ad). The existing `?ref=` link tracking in Company portal → Promote will then count sign-ups and paid weddings per ad.
8. **Learning phase:** Meta wants about **50 conversions per week** ([summary of Meta's guidance](https://admanage.ai/blog/facebook-ads-learning-phase-guide)). At A$10/day you will get about 5–10, so expect **"Learning limited"**. That is normal at this budget. To cope: one ad set only, no edits for 3–4 days at a time, and budget changes of 20% or less.

## 5. Five ready-to-use ad concepts (7–15 s vertical video)

General rules: show **movement in the first second**, burn captions onto the video (most people watch muted), put the price on screen, and show a real phone. Don't use the word "you" with a personal attribute (see section 8).

| # | Hook (0–2 s) | Shot list | Primary text (<125 chars) | Headline | CTA |
|---|---|---|---|---|---|
| A **The seal** | Extreme close-up of a thumb breaking the wax seal on screen | 1) Phone in hand, text arrives "You're invited 💌" 2) Tap, envelope opens, card slides up 3) RSVP in two taps 4) End card "From A$0 · A$28 once" | A wedding invitation guests actually open. Wax-sealed, on their phone, RSVP in two taps. | Invitations that open like real mail | Sign up |
| B **The guest's view** | On-screen text: "What 97 guests see instead of a paper card" | 1) Grandma's phone getting the text 2) Envelope opening 3) Couple's laptop: RSVP list filling up with ticks | Send by text, track every RSVP in one list. Free for up to 50 guests. | Your RSVPs, sorted | Sign up |
| C **Founder** | Founder on camera: "I built this because chasing RSVPs is awful." | Talking head (selfie, natural light) cut with app screens: invitation, guest list, seating plan. Ends on the founder smiling: "Australian-made, A$28 once." | Made in Australia by a small team. Invitations, RSVPs, seating and budget, one price, no subscription. | One price. No subscription. | Learn more |
| D **The price** | Text: "Printed invitations: about A$945. This: A$28 once." | 1) Stack of paper invites and stamps 2) Swipe to the phone envelope 3) Small on-screen note: "Average invitation spend, Easy Weddings 2025" | Printed invites cost hundreds. Ours is A$28 once for every guest, with RSVPs built in. | Skip the printing bill | Sign up |
| E **Seating rules** (Week 2 add-in) | Text: "Uncle Dave and Aunty Sue can't sit together." | Seating plan screen: drag guests, a red warning appears, drag again, it turns green | A seating plan that remembers who shouldn't sit together. Plus RSVPs and budget. | Seating without the drama | Learn more |

Film everything on a phone. UGC-style real footage usually beats polished edits. For social proof, add a real couple's quote once you have one. Never invent a quote.

**Competitor ads:** the Meta Ad Library needs a browser login, so it couldn't be reviewed for this plan. Spend 15 minutes at [facebook.com/ads/library](https://www.facebook.com/ads/library/) searching Paperless Post, Greenvelope, Evite, Paperlust (AU), WooowInvites and Wedivite. Ads that have run for 30 days or more are the ones that work.

## 6. 4-week test schedule and kill/scale rules

| Week | Dates | Do |
|---|---|---|
| 1 | 10–16 Nov | Tracking live, then launch ads A–D at A$10/day. Make no changes for 4 days. |
| 2 | 17–23 Nov | Apply the kill rules. Replace each killed ad with E or a new hook. Start the upgrade emails. |
| 3 | 24–30 Nov | Leave it running. Count purchases from couples who signed up in Weeks 1–2. |
| 4 | 1–7 Dec | Decision gate (below). If it passes, upload sign-ups as a lookalike seed (if 100 or more) and plan the Boxing Day push. |

**Kill an ad** (A$ spent on that ad):
- Link CTR below 0.8% or CPC above A$2.50 **after A$15**
- No sign-up **after A$25**
- Cost per sign-up above A$20 **after A$40**

**Scale an ad:** if its cost per sign-up is at or below break-even (from your real free→paid rate) **and** it has led to at least 1 purchase, raise the budget by 20% every 3–4 days.

**Week 4 gate (about A$280 spent):**
- Paid weddings × A$29 ≥ 70% of spend → keep going and scale from Boxing Day.
- Below 30% → stop paid ads. Put the money into partner codes, organic Reels and venues ([MARKETING_LAUNCH.md](MARKETING_LAUNCH.md)).

## 7. Tracking to add to the site (not built yet)

| Event | Where in the app | How |
|---|---|---|
| **PageView** | Public pages only: `/`, `/demo`, `/vendors*` (SalesPage, DemoPage) | Meta Pixel base code. Fire on each React Router change. **Do not load the Pixel on `/w/:slug` guest pages or `/admin`**: guests didn't sign up for ad tracking. |
| ViewContent | `/demo` envelope opens | Browser Pixel |
| **CompleteRegistration** | Browser: in `SalesPage.tsx` after `api.signup` succeeds. Server: in `POST /a/signup` (`apps/api/src/routes/signup.ts`) after the wedding is created | Same `event_id` in both (use the new `weddingId`) so Meta counts it once. Server event sends a SHA-256 hashed email, IP, user agent, and the `_fbp` and `_fbc` cookie values (add them to the signup body, next to the existing `ref`). |
| InitiateCheckout | `POST /a/w/:wid/plan/checkout` (`billing.ts`) | Server (Conversions API) |
| **Purchase** | Server: Stripe webhook `checkout.session.completed` in `billing.ts` (the only place a payment is confirmed). Browser: `Upgrade.tsx` when returning with `?paid=1` | `value` = amount paid, `currency` = AUD, `event_id` = Stripe session id. Add `{CHECKOUT_SESSION_ID}` to `success_url` so the browser can send the same id. |

Also needed:
- Store the Conversions API access token as a Cloudflare secret (the owner sets it; nobody pastes it into chat).
- Update the Privacy Policy to say the Pixel and Conversions API are used and how to opt out.
- Turn on Automatic Advanced Matching.
- Verify the domain in Business Settings.

## 8. Compliance

- **Meta Personal Attributes policy:** ads must not *assert or imply* a personal attribute of the viewer ([Meta policy](https://transparency.meta.com/policies/ad-standards/objectionable-content/personal-attributes); [Jon Loomer](https://www.jonloomer.com/can-we-use-the-words-you-and-your-in-facebook-ads-copy/)). Relationship status isn't clearly on Meta's list, but play it safe:
  - Avoid "Are you engaged?", "Congrats on your engagement!", "Just got engaged?"
  - Use "For couples planning a wedding", "Wedding invitations guests actually open", or first-person founder lines.
- **Australian Consumer Law, was/now pricing:** don't show "~~A$35~~ A$28" unless the product genuinely sold at A$35 for a reasonable period. A "sale" that runs too long becomes the normal price ([ACCC two-price guide](https://www.accc.gov.au/publications/advertising-selling/advertising-and-selling-guide/pricing/two-price-comparison-advertising)). Write YES20 as "20% off with code YES20, ends 14 Feb". Show the full price, and keep a record of when it ran.
- **Comparing with printed invitations:** use a real, cited figure (about A$945 average spend, [Easy Weddings](https://www.easyweddings.com.au/articles/what-do-wedding-invitations-cost); per-invite costs from about A$3 at [Bridebook](https://bridebook.com/au-en/article/how-much-does-wedding-stationery-cost-in-australia)). **Do not claim "Save A$917"**: it isn't like-for-like, and some couples still print. Keep the source on screen and in your records.

## 9. What to track each week

| Metric | Where to find it | Target |
|---|---|---|
| Spend, CPM, link CTR, CPC | Ads Manager | CTR ≥1%, CPC ≤A$1.50 |
| Cost per sign-up (per ad) | Ads Manager + Promote `?ref=meta` | ≤ break-even from section 2 |
| Free → paid within 14 days | Company portal → Overview | ≥20% (30%+ to be profitable) |
| Purchases, revenue, cost per purchase | Company portal + Stripe | Cost per purchase ≤A$20 |
| Deluxe share, add-ons | Stripe | Deluxe ≥30% |
| Sign-ups from "Made with" links (`?ref=<wedding slug>`, free word of mouth) | Promote | Rising |

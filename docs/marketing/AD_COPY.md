# The Yes List: ad copy for the launch

The copy for the 10 ads in `ads/` and 3 retargeting ads. Everything fits Meta's limits:
- primary text: 125 characters or fewer;
- headline: 40 characters or fewer.

`index.html` shows each ad beside its copy. After changing this file, run `python docs/marketing/build_kit.py` to update it.

## Rules every ad keeps

- **Prices:**
  - Free up to 50 guests.
  - Essentials A$88 and Deluxe A$98, paid once per wedding. Not a subscription.
  - Extra event A$39.
  - No "was/now" prices.
  - The launch code is written as "20% off with code YES20, ends 14 Feb". Use it only from 26 Dec, and keep a record of when it ran.
- **No personal attributes:**
  - Never "Are you engaged?", "Just engaged?" or "Congrats on your engagement".
  - Say "couples planning a wedding" or "the wedding", not "your engagement".
- **Comparisons:**
  - Only V3 compares prices. It cites "about A$170–189 for an animated invitation alone (wooowinvites.com published prices, Nov 2026)".
  - It never claims a dollar saving.
  - Check their price page again before V3 runs, and keep a dated screenshot.
- **Links:**
  - Every ad goes to the **front page**, because that is where `?ref=` is recorded. A `/demo` link would lose the count. The front page has "Open a sample invitation".
  - Today's address is `https://wedding-platform-nd.pages.dev`. Swap in the new domain when it moves; the old address keeps working.
- **Creative settings:**
  - Turn off "Advantage+ creative enhancements", which add music, change text or crop.
  - Use the square PNG for Feed, and the vertical PNG for Stories and Reels.

## Audience (the A$10/day couples test, from FACEBOOK_ADS_PLAN.md)

| Setting | Value |
|---|---|
| Objective | Sales → Website, conversion event **CompleteRegistration** (a free sign-up). Judge on purchases. |
| Budget | **A$10/day** on the campaign, capped at A$280 for 4 weeks. No bid cap. |
| Location | Australia. The tighter option is 50 km around Sydney, Melbourne, Brisbane, Perth and Adelaide. |
| Age | 21+ (minimum age 21) |
| Advantage+ audience suggestions | Engaged / Newly engaged (1 year, 6 months) if they appear for Australia. Interests: Wedding, Bridal shows, Engagement ring, Wedding dress. |
| Exclude | Customer list of paying couples (export from Company portal) |
| Placements | Advantage+. After A$50 of spend, remove Audience Network if it brings clicks but no sign-ups. |
| Ad set | **One** ad set. Launch with 4 ads: **V1, V2, S3, V3**. Keep S1, S2, S4, V4 and V5 to replace ads you kill. |

Each ad is linked as one placement-customised ad: a square for Feed and a vertical for Stories and Reels. Pairs: S1+V1, S2+V2, S3+V5, S4+V1 and V3 (vertical only; a square crop isn't needed).

## S1 · The seal

- **Format:** square 1080×1080, Feed. Pair with V1 for Stories and Reels.
- **Primary text:** A wax-sealed invitation that opens on the guest's phone. They reply in one tap. Start free.
- **Headline:** The invitation they'll actually open
- **Description:** Free up to 50 guests · A$88 once
- **CTA button:** Sign up
- **Link:** `/?ref=meta-s1&utm_source=meta&utm_campaign=launch&utm_content=s1`
- **A/B variants:**
  - Primary B: The envelope opens, the card rises, the guest taps Yes. Wedding invitations people actually open.
  - Headline B: Wax-sealed, on every guest's phone

## S2 · Every reply, one list

- **Format:** square, Feed. Pair with V2.
- **Primary text:** Replies, plus-ones and dietary needs land in one guest list. No spreadsheet. Start free.
- **Headline:** Every reply. One list.
- **Description:** Reminders chase non-replies automatically
- **CTA button:** Sign up
- **Link:** `/?ref=meta-s2&utm_source=meta&utm_campaign=launch&utm_content=s2`
- **A/B variants:**
  - Primary B: Reminders chase the guests who haven't replied, automatically. Every answer lands in one list.
  - Headline B: RSVPs, sorted in one list

## S3 · $88 once · everything

- **Format:** square, Feed. Pair with V5.
- **Primary text:** Invitation, RSVPs, seating, budget and vendors. A$88 once for the whole wedding. Not a subscription.
- **Headline:** A$88 once · everything
- **Description:** Start free for up to 50 guests
- **CTA button:** Sign up
- **Link:** `/?ref=meta-s3&utm_source=meta&utm_campaign=launch&utm_content=s3`
- **A/B variants:**
  - Primary B: One payment covers the whole wedding: invitation, replies, seating plan and budget. Australian-made. Start free.
  - Headline B: One price. No subscription.

## S4 · From free

- **Format:** square, Feed. Pair with V1.
- **Primary text:** Start free for up to 50 guests: the animated invitation, RSVPs and the guest list. A$88 once for more.
- **Headline:** Wedding invitations, from free
- **Description:** Send from your own phone or email
- **CTA button:** Sign up
- **Link:** `/?ref=meta-s4&utm_source=meta&utm_campaign=launch&utm_content=s4`
- **A/B variants:**
  - Primary B: Send it free from the wedding's own email address or your own phone. Replies land in one list.
  - Headline B: Free for up to 50 guests

## S5 · Partner offer (celebrants, planners)

- **Format:** square, Feed. This is **not** part of the couples test. Use it as an organic post, in LinkedIn and Facebook groups for celebrants, and as an attachment to partner emails (PARTNER_KIT.md).
- **Primary text:** For celebrants and planners: 10% off for your couples with your own code, plus free Deluxe for your own events.
- **Headline:** A partner code for your couples
- **Description:** Australian-made wedding invitations and planning
- **CTA button:** Send message (Messenger), or Learn more
- **Link:** `/?ref=partner-ad`
- **Audience, if you ever boost it:** a separate ad set at **A$5/day for 7 days at most**.
  - Location: Australia, ages 25–65.
  - Suggestions: Wedding planning, Event planning, Marriage celebrant (job title, if offered).
  - Objective: Traffic.
  - Only after the couples test has had its 4 weeks.
- **A/B variants:**
  - Primary B: A thank-you for the couples you send us: 10% off for them, free Deluxe for your own events.
  - Headline B: Free Deluxe for your own events

## V1 · Guests reply in one tap

- **Format:** vertical 1080×1920, Stories and Reels. Better still, use video 1 from VIDEO_SCRIPTS.md and keep V1 as the cover image.
- **Primary text:** Guests open a wax-sealed envelope on their phone and reply in one tap. Open the sample to see it.
- **Headline:** Guests reply in one tap
- **Description:** From free · A$88 once
- **CTA button:** Learn more
- **Link:** `/?ref=meta-v1&utm_source=meta&utm_campaign=launch&utm_content=v1`
- **A/B variants:**
  - Primary B: The envelope that opens on the phone. Tap the seal on our sample invitation and see for yourself.
  - Headline B: Open the sample invitation

## V2 · Every reply lands in one list

- **Format:** vertical, Stories and Reels (video 2 is the moving version).
- **Primary text:** Replies, plus-ones and dietary needs land in one list, and reminders chase the rest. Start free.
- **Headline:** Every reply lands in one list
- **Description:** Free up to 50 guests
- **CTA button:** Sign up
- **Link:** `/?ref=meta-v2&utm_source=meta&utm_campaign=launch&utm_content=v2`
- **A/B variants:**
  - Primary B: Stop chasing RSVPs by hand. Automatic reminders, one guest list, and the seating plan in the same place.
  - Headline B: No more chasing RSVPs

## V3 · Sourced price comparison

- **Format:** vertical, Stories and Reels. The source line is in the image, above Meta's bottom overlay. Keep it there.
- **Primary text:** An animated invitation alone is about A$170–189 elsewhere.* Ours is A$88 once, with RSVPs and planning.
- **Headline:** Animated invitation, plus the whole plan
- **Description:** *wooowinvites.com published prices, Nov 2026
- **CTA button:** Learn more
- **Link:** `/?ref=meta-v3&utm_source=meta&utm_campaign=launch&utm_content=v3`
- **Never write:**
  - "Save A$100".
  - "Half the price".
  - "Cheapest". It can't be proven, and the features differ.
- **A/B variants:**
  - Primary B: Animated wedding invitations often cost A$170–189 on their own.* Ours includes RSVPs, seating and budget: A$88.
  - Headline B: A$88 once, invitation included

## V4 · Seating that keeps the rules

- **Format:** vertical, Stories and Reels (video 4 is the moving version).
- **Primary text:** Set rules like "keep these two apart", then press auto-seat. Even a concept plan before anyone replies.
- **Headline:** Seating that keeps the rules
- **Description:** In Essentials, A$88 once
- **CTA button:** Learn more
- **Link:** `/?ref=meta-v4&utm_source=meta&utm_campaign=launch&utm_content=v4`
- **A/B variants:**
  - Primary B: Uncle and aunty can't sit together? Add the rule. Auto-seat fills every table and keeps it.
  - Headline B: Seating without the drama

## V5 · $88 once · everything (Stories)

- **Format:** vertical, Stories and Reels. Pair with S3.
- **Primary text:** Same as S3.
- **Headline:** Same as S3.
- **CTA button:** Sign up
- **Link:** `/?ref=meta-v5&utm_source=meta&utm_campaign=launch&utm_content=v5`
- **A/B variant:**
  - Primary B: Australian-made, from free, and A$88 once if the wedding needs more. Invitation to seating to budget.

## Retargeting: couples who signed up free

**When:**
- Meta struggles to deliver to audiences under about 1,000 people.
- Until the free list is that big, send these as **emails and in-app nudges**. They're free, and the words work there too.
- Add the ad set once the pool reaches 1,000 or more.

**Audience:**
- A custom audience of free sign-ups who opted in to news (`/optins.csv` in Company portal). Upload it only if the Privacy Policy covers it.
- Plus website visitors from the last 30 days.
- Exclude paying couples.
- **A$3–5/day**, kept separate from the test budget.

## R1 · Room for every guest

- **Reuses:** S2 or V2 (the guest list).
- **Primary text:** Guest list past 50? Essentials adds unlimited guests, text reminders, seating and budget. A$88 once.
- **Headline:** Room for every guest
- **Description:** One payment for the whole wedding
- **CTA button:** Learn more
- **Link:** `/?ref=meta-r1`
- **A/B variant:**
  - Headline B: Invite everyone. Pay once.

## R2 · The seating plan is waiting

- **Reuses:** V4.
- **Primary text:** Seating with rules, a concept plan before anyone replies, and auto-seat. Part of Essentials, A$88 once.
- **Headline:** The seating plan is waiting
- **Description:** Plus budget, payments and vendors
- **CTA button:** Learn more
- **Link:** `/?ref=meta-r2`
- **A/B variant:**
  - Primary B: Budget, payment schedule, vendors and quote comparison sit beside the guest list. A$88 once.

## R3 · Every guest's photos, collected

- **Reuses:** S3 with the Deluxe line, or a photo from video 6.
- **Primary text:** Guests' photos by QR code on each table, collected in one place. Deluxe, A$98 once for the whole wedding.
- **Headline:** Every guest's photos, collected
- **Description:** Deluxe adds a second event too
- **CTA button:** Learn more
- **Link:** `/?ref=meta-r3`
- **A/B variant:**
  - Headline B: Deluxe: A$98 once

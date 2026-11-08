# Stress run: 500 sample weddings — findings

The suite is `apps/api/test/launch.overnight.test.ts`. Every push runs it with 12 weddings (the push CI has a 15-minute limit). The Nightly workflow's
`stress` job runs it with 500 (`STRESS_WEDDINGS=500`; you can also start it by hand with any number). The weddings
are generated from a seed, so a failure always comes back the same way. All of them share one database and go
through a couple's whole year, one phase at a time:

1. Sign up. Free, Essentials or Deluxe, upgraded by the platform, a 100% promo code, a card payment (the webhook
   arrives twice), a half-price code, or a payment link marked paid. Essentials-then-Deluxe pays only the
   difference. Extra events are bought by card.
2. Import guests: 10–350 people, households of 1 to 12, plus-ones, unicode names, missing mobiles and emails,
   repeated names and mobiles. A bad row stops the import, and Free stops at 50.
3. A concept seating plan made with auto-seat before any invitation goes out.
4. Invitations by text and email through the real cron, over a week, with quiet hours (Sydney and Perth) and
   daily caps.
5. Replies: "yes" for part of a household, "no", different answers for each event, changes of mind, dietary
   needs, replies after the closing date, meals.
6. Seating after the replies: auto-seat, versions, making a version current, publishing.
7. Declines after being seated: on the website, recorded by the couple, by email, and "fewer of us coming".
8. The planner: budget, vendors with quotes and a booking, a wedding party member and their page.
9. The inbox: guest questions, a decline by email, a vendor's quote filed under the vendor, the same email
   delivered twice, mail to an unknown address.
10. The company portal checked against every wedding: stats, money, per-wedding figures, feedback, staff, a bot.
11. Isolation: every couple's session and guest link is tried against the next wedding.

After every phase it checks:
- nobody who said no (or who isn't among the "first N" of a yes for N) has a seat, a meal or dietary notes;
- seats are at a table of the same event and wedding;
- no table holds more people than it has seats;
- published seating shows only people who are coming;
- the overview and seating figures match what happened;
- the company's totals equal the sum of the payments;
- no 5xx, and no request slower than 8 s.

## Faults found and fixed

| # | Fault | Fix | Commit |
|---|---|---|---|
| 1 | **A yes for N of a household seated everyone on the invitation.** A family of four replying "2 of us" kept four seats. All four were published to guests and listed as table mates, while the overview counted two. Auto-seat filled tables with people who weren't coming. | Only the first N are coming. The others get no seat (they are unseated when the count drops) and never appear in published seating, table mates or the guide. | c154f05, 8fbb99c |
| 2 | **A meal could be set for someone who had said no**, so it went on the caterer's list. | Refused (400) unless they're invited and haven't said no. | c154f05 |
| 3 | **The company's "replies" figure was too high.** It counted rows with no answer (a count the couple had noted), replies to removed events, and deleted weddings. | It now counts answers only. | c154f05 |
| 4 | **Main's CI had been red for about 15 pushes on stale tests.** The promo price was still at $28. A "Free" email test ran on a wedding whose plan includes texts. A seating test matched people by a generated name that two guests shared. | The tests now match the app. | 6907a14 (with 55b7844 from another session) |

## Still open (reported, not changed)

- **Free can use the whole planner.** `plan.ts` says the budget, checklist, vendors and quotes need Essentials,
  but no planner route checks the plan, so Free couples get them through the API and the admin. Decide which
  it is, then either check it in `planner.ts` or change the plan table. (planner.ts is being reworked by the
  ceremony session.)
- **The company's wedding list stops at 100**, with no paging. Search still finds any wedding.
- **A guest's RSVP says how many are coming, not who.** The first N names on the invitation count as coming
  (fault 1 now makes seating agree with that). Which of a family can't come isn't recorded, and a couple can
  only fix it by reordering names.

## Simplifications (impact × effort, highest first)

| Rank | Where | Today | Simpler | Impact | Effort |
|---|---|---|---|---|---|
| 1 | RSVP | Guests pick a number from a list ("how many of you"), then the first N names count | Tick the names that are coming (one tap each). The count follows, and seating and meals know exactly who | High | M |
| 2 | Texts | A new wedding starts with **no automatic texts**: no invitation when a guest is added, no thank-you, no reminders, no night-before guide. The page reads "0 texts sending themselves". Each one is a separate "+ New message" | Start every new wedding with the usual set switched off, so the couple switches each on with one tap and the wording is already written | High | S–M |
| 3 | Seating after a reply | Each "no" after publishing leaves guests' plan out of date until the couple opens Seating and taps Publish again | One "Update guests' seating" button on the Overview (the changes are already known: `published.saidNo`), or publish automatically when the only change is someone leaving | High | S |
| 4 | Import | One bad row (an email with a typo) refuses the whole file | Add the good rows and list the rows to fix, with their row numbers | Med | S |
| 5 | Email or text | "Email instead of text" is set guest by guest in the drawer | A bulk "Send by: text / email / both" in Select, and a column in the import | Med | S |
| 6 | Meals | Each person's meal is saved one at a time | "Everyone: set menu" in one tap, then change the few who differ | Med | S |
| 7 | Wedding party | A member added from the planner is invited to the first event only, with no reply | Ask which events, and whether they're coming (they almost always are) | Low | S |

## Enhancements (ranked)

1. **Per-person RSVP** (see simplification 1). It removes the guesswork behind seating, meals and dietary counts.
2. **Starter texts for every new wedding**, off until switched on (simplification 2).
3. **Auto-republish seating** when someone leaves a table (simplification 3), with a text to their table mates
   only if the couple chooses it.
4. **"Who still needs a seat or a meal"** as a single checklist on the Overview, made from the same rules the
   invariants use.
5. **Company: paging** on the weddings list, and the per-wedding figures (guests, replies, paid) in one CSV.

## Small simplifications made

None yet: the files they would touch (texts, guests, the invitation page and the planner) are all being
changed by other sessions tonight. Each item above names its file, so it can be picked up once those
sessions land.

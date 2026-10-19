# Roadmap: the ultimate wedding app

**Direction (19 Oct 2026):** the product is the ultimate wedding app, with a wedding planner built in. It is not a general platform for any kind of event.

## What this changes

- **No generic event templates.** The earlier plan for "templates for other events" (birthdays, parties and so on) is dropped.
- **Extra events are wedding extras only.** A couple can still add a welcome dinner, a ceremony and reception at different venues, or a recovery brunch. The UI, copy and marketing are about weddings.
- **Tenant #1's 30th birthday stays as a one-off.** It runs on the existing multi-event code. That code must keep working and keep its blue theme, but no new features are built for birthdays.

## Already in place (guest side and day of)

These parts already make up the wedding app:

- Invitation and RSVP, with dietary and meal choices
- Night-before guides with live weather, timeline and seating
- SMS: scheduling, reminders, replies and the night-before text
- Guests: list, import and themed exports
- Seating plan
- Photo albums, with a live camera and filters
- Messages with guests, and the message board

## The planner: new modules, in build order

1. **Planning checklist.** Tasks based on months to go, starting from a standard wedding plan (12 months out, 9, 6, 3, 1, week of, day of).
   - Each task has a due date, an owner (either partner, or someone from the wedding party), a done state and notes.
   - Overdue tasks show in "Needs you".
2. **Budget.**
   - Categories (venue, catering, attire, flowers and so on), each with estimated, quoted and paid amounts.
   - A total against the budget, with a cost per guest worked out from confirmed RSVPs.
   - An Excel export in the wedding theme, like the existing exports.
3. **Vendors.**
   - A contact card for each supplier: contract file, deposit, balance, due dates, arrival time on the day and notes.
   - Payment due dates feed into the budget and "Needs you".
   - An optional SMS reminder to the couple when a payment is due.
4. **Day-of run sheet.**
   - Grows out of the timeline builder ("copy to run sheet" already exists).
   - Each row gets a vendor and wedding-party assignment.
   - A shareable read-only link for the coordinator and vendors.
   - A night-before text to vendors with their call times.
5. **Wedding party.**
   - Bridesmaids, groomsmen and their roles, plus their tasks from the checklist.
   - Attire and fittings, and a group message to them.
6. **Ideas board.** Inspiration images and links for each category (dress, flowers, styling). Uses R2 photo storage.
7. **Gifts and thank-yous.**
   - Log gifts against each guest.
   - Track thank-you notes, with an optional thank-you text.
8. **After the wedding.** Album delivery, the thank-you round, and an archive and export of everything.

## Admin information architecture

The planner sits under **Account**, because it covers the whole wedding:

- Planner: Checklist, Budget, Vendors, Run sheet, Wedding party, Ideas, Gifts
- Event sections (guests, SMS, seating, photos, setup) stay as they are

A planner card is added to the Account Overview, showing:

- tasks due this month
- budget used
- next payment

## Rules that still apply

- **Cost:** free tiers first (Cloudflare D1, R2, Pages). Ask before adding any paid service; the setup and implementation budget is $150.
- **Data model:** one new table per module (checklist_item, budget_line, vendor, payment, party_member, gift), each scoped by wedding_id, with a migration, a Drizzle mirror and tests for each.
- **Security:** the same layer as everything else. Members only, JSON-only writes, an audit row for every change, and rate limits on anything a guest can reach.
- **Customer-facing copy** speaks to the couple about their wedding.

## Not now

- The sales side (landing page, sign-up, payments) stays paused until the couple has used the planner themselves.

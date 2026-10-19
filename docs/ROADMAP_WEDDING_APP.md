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

## Research (19 Oct 2026): features we're missing

Sources:
- **thecompleteweddingplanner.com.au** — an AU printed planner ($69.95), plus a $39.95 guest-list and budget spreadsheet. Its headline is a summary of "payments still owing", and it has a keepsake section.
- **The Etsy "Ultimate Wedding Planner Bundle"** — the page blocked automated reading. Similar Google Sheets bundles have 15–27 tabs: budget vs actual, RSVP, vendors and quotes, payment schedule, checklist by month, day-of binder, honeymoon and packing, gifts and thank-yous, mood board, bridal party.
- **Leading apps** — Zola, The Knot, Joy, Bridebook, Easy Weddings, Guestboard, RSVPify, Minted.

Everything below fits the free tiers unless flagged. Building order is the ★ picks first.

### Guest experience
- ★ **Gift registry, cash fund and AU wishing well.** Registry links and honeymoon "experiences" funded by PayID or bank transfer. Guests pledge, and the couple confirms by hand. No payment gateway, so no fees.
- ★ **Accommodation and shuttle board.** Hotel codes, shuttle times with seats left, and an SMS one hour before the shuttle.
- ★ **Song requests.** Collected with the RSVP; the couple marks each must-play or do-not-play; the DJ gets the list as an export.
- **Add to calendar.** An .ics file for each event, plus a Google Calendar link.
  - The Google Wallet pass is free.
  - The Apple Wallet pass needs a developer account (US$99/yr), so it stays optional and needs the couple's OK first.
- **Countdown and "our story" pages.**
- **Who's who.** Opt-in guest profiles, plus "people at your table" before the day.
- **Plus-one and kids' rules, and accessibility needs.** These flow into the dietary and caterer exports.
- **Guest question assistant.** Answers come from the wedding's own details using keyword search. AI is optional; Cloudflare Workers AI has a free daily allowance and charges beyond it.
- **Live-stream link.** Shown only during the ceremony, with the replay afterwards.
- **Multilingual invitation**, for overseas and multicultural family.

### Planner
- ★ **AU checklist by months to go, with Notice of Intended Marriage (NOI) alerts.** The NOI is due between 18 months and 1 month before the wedding.
- ★ **Vendor payment schedule.** Deposits, instalments and final balances, with reminders. Includes a day-of envelope list for tips and cash.
- **Budget split against average AU spend.**
- ★ **Seating-conflict checker.** Keep-apart and keep-together pairs, table capacity, access needs and kids.
- **Households and an A/B list.** Send the B-list automatically as declines come in.
- ★ **Printable stationery and signage.** Welcome sign, table numbers, QR table cards, menus, place cards, seating poster and address labels, all in the invitation's theme.
- **AI wording helpers** for vows, speeches and thank-yous. Optional and capped.
- **Wedding party hub.** Roles, tasks, outfits and a private thread.
- **Travel helper** for overseas guests: arrivals and airport pickups.

### Day of
- ★ **Live photo wall.** A full-screen /live page cycling new photos and message-board posts, cast to the venue screen. Uses polling, which is free.
- **QR table cards.** Each opens that table's menu, the people at the table and photo upload.
- **MC "now / next" and speech timer.** Texts vendors "5 minutes to the first dance".
- **Door check-in and headcount** for welcome drinks and brunch.
- **Wet-weather trigger.** When rain is forecast 24–48 hours out, offer to send the wet-weather SMS.
- **Guest games.** Shoe game, photo scavenger hunt, trivia.

### After
- ★ **Thank-you tracker.** Each gift is linked to whether its note has been sent.
- **Gallery highlights.** Download everything as one zip, and a guest-book PDF made from the message board.
- **Vendor review reminders, and an anniversary text with photos.**
- **AU name-change checklist.** Births, Deaths and Marriages (BDM) certificate, then passport, Medicare, ATO, bank and licence.

### Cost flags (all optional)
- Apple Wallet: US$99/yr
- Real-time sockets on Durable Objects: US$5/mo. Polling avoids this.
- AI beyond the free Workers AI allowance

## Built (19–20 Oct 2026)

**Wedding planner** (in the first event's section):
- At a glance: days to go, money, still to book, payments coming up, quotes to decide on, next up
- Checklist: the usual AU plan counted back from the date, with the NOI deadlines marked Legal
- Budget, including commitments from booked vendors
- Vendors: quotes filed as PDF or photo; the assistant reads them and compares vendors; finder within X km of the venue
- Transport: shuttle runs; guests book seats from their invitation
- Music: guests' song requests and your own picks; download for the DJ
- Print: welcome sign, table numbers, place cards, seating chart, menu cards
- Gifts and thank-yous, with drafted notes
- Assistant
- Its reminders show in Overview → Needs you

**Wedding party:**
- Bride's and Groom's sides (names editable)
- Roles taken from the guest list
- Their own run sheet and packing lists on their own link
- Each partner's on-the-day checklist

**Guests:**
- Message board
- Song requests in "Message us"
- Add to calendar
- Shuttle seats
- Live photo wall for the reception screen
- Linked photo storage (Drive, Google Photos, Dropbox, OneDrive)
- WhatsApp import

**Seating:** a checks panel for capacity, split parties, and keep-apart / keep-together rules.

**Added overnight (20 Oct):**
- Who's who on the invitation: the wedding party by side, names and roles only. Off until it's switched on in Wedding party.
- Door check-in in the Wedding planner. Two phones can be used at once.
- Now/Next and an MC speech timer on the wedding party's page.
- Shared album after the day: guests see and save everyone's photos from their own events, 90 at a time.
- Print → Run sheet for the day: the whole day, the party, and suppliers with arrival times and phones, for the venue, coordinator, photographer and MC.

**Review fixes:**
- Quick changes in a row no longer conflict.
- Check-in and Transport work when opened from a link.
- Unsaved planner edits ask before you leave.
- Dates and days-to-go are counted where the wedding is.
- Money fields take cents.
- The seating chart runs on to more posters instead of dropping names, and each sheet prints on its own paper size.
- The live wall shows new photos next and never jumps back.
- Shuttle seats are given back when a guest declines.
- Linked storage refreshes its token once an hour, not for every photo; puts all of an event's photos in one folder or album; and retries copies that were cut off.

**Still open from the research:**
- Accommodation board
- Multilingual invitation
- QR table cards (photo upload uses each guest's private link, so a shared QR needs a public upload page first)
- Guest games
- After-the-wedding anniversary text
- Name-change checklist (part of the checklist already)
- Album thumbnails (needs Cloudflare Image Resizing, a paid add-on, or thumbnails made at upload)

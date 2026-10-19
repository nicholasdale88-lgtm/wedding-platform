# How it all fits together

One wedding, three sides that must always agree:
- **The couple's admin.** They set things up and watch progress.
- **The guests' pages.** Invitation, RSVP, night-before guides, photos.
- **The texts.** These link the two together.

Everything reads and writes the same records, so a change on one side shows up everywhere at once.

**The rule between the two sides.** The admin is the workhorse: every word, link, photo, time and setting a guest sees is edited there. The guest side is finished stationery: it never shows admin controls, never links to the sign-in, and never loads admin code. Old or mistyped links get a gentle message in the same style. The couple sees exactly what a guest sees through **Preview as this guest** (invitation, each night-before guide, photos), which never counts as the guest opening it.

| Guest page | Address | Needs their link | Edited in admin |
|---|---|---|---|
| Invitation + RSVP | `/w/<wedding>/?g=…` | No (shows the name lookup) | Guest pages → Invitation, Every word |
| Night-before guide (each event) | `/w/<wedding>/tomorrow/<event>?g=…` | Yes | Guest pages → Night before; Seating; Dietary |
| Photo upload | `/w/<wedding>/photos?g=…` | Yes | Photos |

```
 COUPLE (admin)                          DATA (one wedding)                 GUEST (phone)
 ──────────────                          ──────────────────                 ─────────────
 Setup / Guest pages ── content ───────▶ wedding.content + text catalogue ─▶ invitation, guides
 Guests (add/import) ── invitations ───▶ invitation, person, invite_event ─▶ personal link ?g=
 Texts (schedule) ───── campaigns ─────▶ campaign, campaign_slot ──cron──▶ SMS with their link
                                         rsvp ◀──────────────────────────── RSVP form / "YES" text
 Overview "Needs you" ◀── computed ───── everything above
 Dietary / Seating ──── meals, tables ─▶ person.meal_*, seat_table ───────▶ night-before guide
 Photos ◀──────────────────────────────── media ◀───────────────────────── photo upload page
```

## The couple's journey (admin), in order

Each step says where it happens, what it changes, and what guests then see. The Overview "Needs you" list always shows the next thing that needs doing, with a button straight to the fix.

| # | Step | Where in admin | What it changes | What guests see / get |
|---|---|---|---|---|
| 1 | Set up the wedding: names, events, venue, look | Setup wizard → Guest pages | wedding, event, content | The invitation's names, dates and theme |
| 2 | Add guests | Guests → Add guest / Import from Excel | invitation, person, invite_event | Each invitation gets its own private link |
| 3 | Check pages as a guest | Guests drawer → **Preview as this guest**; Guest pages → live preview | nothing | Exactly what that guest will see |
| 4 | Connect texts | SMS setup | sender number, admin mobile | — |
| 5 | Send invitations | Texts → Invitation (autopilot) | sms_out | **Text:** invitation with their link |
| 6 | Track replies | Overview, Guests (filters), Texts → Replies | rsvp, sms_in | **Text:** thank-you after they reply |
| 7 | Chase non-replies | Texts → Reminder dates (autopilot) | campaign_slot | **Text:** reminder naming only what they still owe |
| 8 | Dietary and meals | Dietary | person.diet, person.meal_* | Their meal on the guide's place card |
| 9 | Seating | Seating | seat_table, person.table_id | Their table and tablemates on the guide |
| 10 | Night-before details | Guest pages → Night before (each event) | content.guide, parking video | **Text at 5pm:** link to their guide |
| 11 | On the day | Texts → Rain plan (manual) | — | **Text:** wet-weather plan, if sent |
| 12 | Photos | Photos | media | **Text next day:** photo upload link |
| 13 | Wrap up | Settings → Backup, exports | — | — |

## The guest's journey

1. **The invitation text** arrives with their personal link (`/w/<slug>/?g=<token>`).
2. **The invitation opens:**
   - The envelope plays on the first visit only. After that it goes straight to the card, at the same scroll position.
   - It greets them by name.
   - Sections for events they aren't invited to are not sent to their phone at all.
3. **RSVP** is one screen:
   - yes or no per invited event
   - how many are coming
   - dietary needs per person
   - each event's own questions (for example, riding)
   - a note to the couple

   Saving it updates their invitation in the admin straight away. A thank-you text follows about 10 minutes later.
4. **Or they reply by text.** "YES" or "NO" works for guests invited to one event. Anything else is forwarded to the couple and shows under "Needs you".
5. **Reminders** go out only while something is still unanswered, and never after they've replied.
6. **The night before** (5pm): a text links to their personal guide for each event they're coming to. The guide shows:
   - weather
   - parking video and directions
   - their table and who's at it
   - their meal
   - the run sheet
   - contacts
7. **The day after:** a text links to the photo upload page. Photos land in the admin's Photos tab.

## How it sells: the same admin for every couple

Three layers. Only the bottom one belongs to a particular couple.

```
 PLATFORM  (you, the seller)      Super-admin console: weddings, plans, SMS credit, refunds, support
    │
 TEMPLATES (designs you offer)    "Garden" (today's locked design) + future designs.
    │                             Each is a set of page views + a default text catalogue with
    │                             merge tags ({partner1}, {event}, {venue}…), never real names.
    │
 WEDDINGS  (each paying couple)   Their events, guests, texts, wording, photos, settings.
                                  Sophie & Nicholas are simply wedding #1.
```

**What a new couple does** (the admin journey above, from step 1):

| Stage | What happens | Built in |
|---|---|---|
| Find you | Landing page, then **Start free** | M5 |
| Sign up | Email sign-in link. A new wedding is created from the chosen template | M5 |
| Set up in ~10 min | 6-step wizard: names and date, venue, events, look, guests, send a test to me | M5 (uses the same screens as steps 1–4 above) |
| Build for free | Every admin screen works; previews show the real guest pages | now |
| Pay to go live | Sending texts and publishing pages need a plan (Stripe Checkout). Texts use prepaid credit packs | M5 |
| Run the wedding | Same admin as yours: Overview, Guests, Texts, Seating… | now → M4 |
| Afterwards | Read-only plus export 90 days after the last event; photo zip download | M5/M6 |

**Why nothing has to be rebuilt to sell it:**
- **Events are a list, not "wedding + 30th".** A couple with one event, or with welcome drinks and a recovery brunch, gets the same admin. Columns, filters, figures, RSVP questions and night-before guides all follow their events (already true of Overview and Guests).
- **No couple's words are in the code.** CI fails the build if "Sophie", "Nicholas", "Glenworth" or "horse" appear in app code. All wording lives in each wedding's catalogue and content.
- **Every wedding's data is walled off.** Every query is scoped to the wedding, sign-in is per wedding, and non-members get "not found". Tests prove one wedding can't read another.
- **Features are gated by plan on the server,** so paid features can't be switched on from the browser.
- **SMS is metered per wedding,** with a wallet, a daily cap and opt-outs shared across the whole platform (Spam Act).

**Still to build for selling:** landing page, sign-up, wizard, Stripe plans and credit packs, super-admin console, template picker, legal pages, and the "stranger couple" end-to-end test (docs/13). These are M5. They reuse the screens being built now, so the order is safe: your wedding works first, and the same code serves every customer.

## Rules that keep it all consistent

- **One source of truth.** The guest pages and the admin preview render the same components with the same data.
- **Every word comes from the wedding's text catalogue,** seeded from the design's exact wording and editable in Guest pages → "Every word". No wording lives in the code.
- **Visibility is decided on the server.** An invitation only receives the content for the events it's invited to.
- **One invitation record ties it all together.** Guest edits, admin edits and text replies all write to it. A version number stops one change silently overwriting another ("Updated elsewhere, reloaded").
- **Texts are driven by data, not by people.** The cron checks who qualifies at the moment each text is due, so a late reply is respected automatically.

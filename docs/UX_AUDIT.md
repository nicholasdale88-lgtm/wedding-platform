# UX audit: can a couple set it up, find answers, and trust it on the day? (2026-11-08)

Method: every couple-facing journey walked through the code (admin, guest pages, sign-up, Help search), counting taps from the admin home to the main outcome (target 3), and checking wording, dead ends, "what next", double typing, empty states, errors, and whether Help search answers couples' own phrasing. Fixes marked **Fixed** shipped with this audit; the rest are ranked for later.

## Journeys

| Journey | Taps to outcome | Notes |
|---|---|---|
| Sign-up | 3 (Start free, form, submit) | Clear errors; "already an account" links to sign in. With no date, the wedding gets a placeholder date but the Setting-up step "Your names and the date" still ticks (see 9). |
| First-run Setup (Account → Setting up) | 1 per step | Texting step ticked only for a paid texting number (see 1). |
| Invitation design | 3 (Setup → Invitation → Edit on the invitation) | Fine, but the menu word "Setup" hides the invitation (see 8). Help couldn't find "change the invitation wording" (**Fixed**). |
| Guests: add / import / contacts | 2–3 (+ picking a file) | Empty state didn't mention Import contacts; "No guests match." was a dead end; import toast had no next step (all **Fixed**). |
| Texting setup (own phone, own number, email) | 2 (Settings → Texting → choose) | Three names for one choice; the paid-number form read as compulsory; mobile typed twice (own number doesn't prefill it). Wording **Fixed**; prefill is open (see 7). |
| Sending + Send me a test | 4 (Texts → Invitations row → Send now → confirm) | Over target; most couples expect a single "Send invitations" button (see 5). Test-send errors mentioned "Resend" and "the site owner" (**Fixed**). |
| RSVPs / who hasn't replied | 1 (Needs you → See who) | The filter said "Awaiting" while everything else says "still to reply" (**Fixed**). Help sent "who hasn't replied" to the inbox guide (**Fixed**). |
| Dietary | 2 (Guest list → Dietary → Give them their menus) | Good. |
| Seating (concept plan, rules, suggestion) | 2–3 | Stage bar gives one next step (good). The stage menu fell back to "Draft"; "Nobody to seat yet." didn't say what to do (both **Fixed**). |
| Planner: budget, vendors, checklist, ceremony | 2 | Empty states say what to do. |
| Wedding party | 3–4 (Wedding party → + Add → role → name) | "No one yet." had no prompt (**Fixed**). Help ranked "add a bridesmaid" under Adding guests (**Fixed**). |
| Photos | 2 | Empty state didn't say where table QR cards come from (**Fixed**). |
| On the day | no single place | Night-before page (Setup), run sheet (Wedding party), cards (Planner → The day), photos. Help had no answer for "what happens on the day". **Fixed** by the new Rehearsal page and its Help guide. |

## Help search, in couples' words

| Phrase | Before | After |
|---|---|---|
| how do I send invites | Sending invitations | same |
| seat guests before they reply | Seating | same |
| test my texts | Sending invitations (weak, score 3) | Sending invitations (4) |
| change the invitation wording | **Sending invitations** (wrong) | Getting set up (look, wording) |
| who hasn't replied | **Replies inbox** (wrong) | Sending invitations and reminders |
| add a bridesmaid | **Adding guests** (wrong) | Your wedding party |
| print table cards | Photos | Photos (stronger: print, place cards, signs) |
| what happens on the day | Making the most of it (weak) | Rehearse your wedding day |
| rehearse / dry run / simulate | nothing | Rehearse your wedding day |

These phrasings are now tests in `packages/shared/test/help.test.ts`.

## Issues ranked by impact

1. **Free own-phone and email couples were told texting isn't set up.** Setting up stayed unticked; Needs you said "Texts are not set up yet"; the menu showed "Texts off". **Fixed**: the overview counts own phone and email as set up, and the wording offers all three ways (Account home, Needs you, Texts page).
2. **"Share the invitation" shared a link that private weddings block.** Weddings are private from sign-up, so guests got "This invitation is private". The couple, signed in, never saw it. **Fixed**: on a private wedding it explains and opens the Guest list, where each guest's own link is shared.
3. **No way to check the whole thing before the day.** Couples couldn't see what each guest gets at each moment, or what would break. **Fixed**: the D-Day Rehearsal (below).
4. **Help missed four everyday questions** (wording, who hasn't replied, bridesmaid, on the day). **Fixed** with synonyms, a clearer party title and the new guide.
5. **Sending invitations is 4 taps, and that they go out automatically isn't obvious.** Open: add a "Send invitations" action to the event Overview's quick actions and say "Invitations go out by themselves from <date>" on the Texts header.
6. **Three names for "send from my own phone".** **Fixed** in Guests and SmsSetup ("Send from my own phone (free)"); the paid-number intro now says it can be skipped.
7. **Mobile typed twice** (Texting → Your numbers, then Own number). Open: prefill the own-number field from the saved mobile.
8. **"Setup" hides the invitation.** Open: rename the menu item "Invitation & setup" (check it fits the menu; Help places too).
9. **Date step ticks with a placeholder date.** Open: carry `dateToBeSet` in the overview and keep the step unticked. (Rehearsal already flags it red.)
10. **Test-send errors used jargon** ("Resend", "the site owner") or pointed vaguely. **Fixed**.
11. **"Awaiting" vs "still to reply".** **Fixed**.
12. **Guest list dead ends** (no-match, empty state without contacts import). **Fixed**.
13. **Photos empty state** didn't say where to print QR cards. **Fixed**.
14. **Seating wording** ("Draft"; "Nobody to seat yet."). **Fixed**.
15. **Missing next steps** after import, on Help no-match, on an empty wedding party side. **Fixed**.
16. **Guest drawer says "Text (automatic)"** for own-phone couples. Open: "As set in Texting".
17. **Help steps say "Guests"; the menu says "Guest list".** Open: align Help wording.

## D-Day Rehearsal (new)

Account → Rehearsal (linked from both Overviews and Help: "Rehearse your wedding day"). Read-only: `GET /api/a/w/:wid/rehearsal?asOf=<ISO>` (`apps/api/src/routes/rehearsal.ts`, logic in `apps/api/src/lib/rehearsal.ts`).

- **Timeline**: invitations out → replies coming in → reminders → replies close → final seating → night before → morning → ceremony → reception → day after. Each moment comes from the wedding's own dates (invites-from date, first reminder, reply-by date, the night-before text's time, the event start). A slider and "jump to" chips move through it; `asOf` picks the starting moment.
- **At each moment**: every message that goes then, rendered from the real template with the real renderer (the same as "Send me a test"); who it reaches by text, email, own phone, post or not at all; quiet-hours warnings. For each kind of guest (said yes, said no, not replied, using a real guest of that kind, or a marked stand-in), what they get, what they see (reply, table from the published plan, dietary, night-before page, photo page) and their actual page in a phone frame, opened as the couple's preview with `?preview=1&asOf=` so the countdown reads as it will then and nothing is recorded. Also what the wedding party (run sheet "on now / next") and the coordinator see.
- **Rehearsal checklist**: green, amber or red per area (invitations and texts, replies, seating, night before, on the day, photos, wedding party and coordinator), each problem with a Fix it link. Checks include: date not set, no texting (N guests can't be reached), plan without texts, paused, guests with no mobile or email, your own mobile missing, unfilled blanks in a message, texts due in quiet hours, daily limit, no reply-by date, no reminder scheduled, replies outstanding after the close, seating not published, guests who said yes with no table, no night-before page or one missing parking, address, run sheet or contacts, no night-before text, no venue, nowhere for photos, an empty wedding party run sheet, and no day-of coordinator.
- Tests: `apps/api/test/rehearsal.test.ts` (moments and as-of, real words per guest kind, readiness checks, read-only), `apps/web/test/previewClock.test.ts`.

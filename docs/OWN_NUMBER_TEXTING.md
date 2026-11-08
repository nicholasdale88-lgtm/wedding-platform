# Texting from the couple's own mobile number

What's possible, what we built, and what to know. Checked 8 Nov 2026 against mobilemessage.com.au/api-documentation
and the Mobile Message help centre (articles 10312705 and "Can I send SMS messages from my own number?").

## What Mobile Message offers

- **Own number as the sender, through the API.** `POST /v1/senders` with `{ "number": "04xxxxxxxx", "label": "…" }`
  texts that mobile a **confirmation link** (free). The owner opens it on that phone and taps **Confirm** within
  **1 hour**. It's a link, not a 4-digit code: there's nothing to type into our app. Answers: `verification_sent`;
  **409** if the number is already an active sender; **429** if a link went to that number in the last 5 minutes
  (or too many are pending).
- **Is it confirmed?** `GET /v1/senders` lists the account's active senders (`sender`, `type` = `own` for a mobile,
  `alpha` for a name, `label`, `is_default`). Our number appearing there means it's confirmed.
- **Sending:** `POST /v1/messages` with `sender` set to that number. The sender must be active on the account.
  Up to 10,000 messages a request, 5 requests at once; `Idempotency-Key` makes retries safe.
- **Cost:** no extra charge for an own-number sender; the usual per-text price.
- **Replies go to the phone**, not to the account, so our "reply YES" handling and automatic answers don't see
  them. RSVPs still come in through each guest's link; a texted reply can be recorded on the guest's page.
- **Other limits:** Australian mobiles only (a virtual number works if it can receive the link). A confirmed number
  can't be edited, only deleted and added again. Nothing about the phone's plan: texts go over Mobile Message's
  network, the phone needn't be on, and bulk sends don't touch the couple's plan. The docs give no limit on how
  many own numbers one account can hold, and there's no API to delete one (dashboard only).

## ACMA Sender ID Register

The register covers **alphanumeric** sender IDs (a name such as "SamAndAlex"): they must be registered (Mobile
Message submits them through `POST /v1/acma-registration`, checked by them then by ACMA), and unregistered ones
are flagged to recipients. A **mobile number** sender isn't an alphanumeric ID; the protection there is that the
number's owner confirms it on the phone. (To confirm with Mobile Message before relying on it at scale.)

## What we built

Settings → Texting → **Send from my own number (automatic)** (shown when the site's Mobile Message account is
connected): the couple enters their mobile, we ask Mobile Message to text the link, they tap Confirm on the phone,
then **I've tapped Confirm** checks `GET /v1/senders`. Once confirmed, the wedding's sender is their number, and
every automatic text (invitations, reminders, the night-before guide, Send now) goes from it, with the usual queue,
daily limit, quiet hours and plan. A link over an hour old shows as expired (send a new one). The cron checks
active numbers every run: a number no longer listed goes back to **Text from my own phone** (the free, by-hand
stepper) and the couple sees why. **Stop using my number** does the same on request.

The free option stays: **Send from my own phone (free)** builds each message for the couple to send from their
own Messages app, one guest at a time.

## What we'd like from Mobile Message

1. A webhook (or a status on `GET /v1/senders`) when an own-number sender is confirmed or removed, instead of
   polling.
2. `DELETE /v1/senders` so "Stop using my number" also removes it from the account.
3. Optionally, forwarding replies to an own-number sender into the account's inbound webhook (so YES/NO by text
   could still be recorded automatically).
4. Confirmation that one account can hold an own-number sender per wedding (hundreds), and any per-number limits.

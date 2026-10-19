# 05: SMS engine (the part that must never misbehave)

## Provider: Mobile Message (mobilemessage.com.au)
- Send: `POST https://api.mobilemessage.com.au/v1/messages`
  - Basic auth `MM_USER:MM_PASS`
  - header `Idempotency-Key: <uuid>`. Re-use the **same key on retry** of the same batch.
  - body `{ messages:[{ to:"0412345678"|"61412345678", message, sender, custom_ref }] }`, up to 10,000 per request
  - set `custom_ref = sms_out.id` so receipts map back.
- The response has `results[]` with `status` (`success` | `error` | `blocked`), `message_id`, `cost`. Store `provider_id = message_id`.
- Limits: max 5 concurrent requests, so process sends sequentially per cron run. HTTP 429 means wait 2 s and retry (max 3). 401 means bad credentials: alert the admin and stop. 403 means no credits: stop, alert, and mark slots `failed` so they retry.
- Characters: GSM-7 only unless `enable_unicode`.
  - Validate templates in the editor: replace curly quotes, flag emoji.
  - Parts: ≤ 160 characters is 1 part; otherwise `ceil(len/153)`.
- Inbound and delivery webhooks are set in their dashboard. **Before coding inbound, fetch https://mobilemessage.com.au/llms-full.txt and use the exact field names.** The prototype tolerated `sender|from|number`, `message|text|body`, `message_id|id`.
- Sender: the wedding's free **dedicated number**, so replies route back.
- Pricing: 1.6¢ + GST per credit on the first purchase within 30 days of signup, 4¢ + GST standard. Credits never expire. 50 free credits at signup.

## Templates
Placeholders, rendered per invitation:

| Placeholder | Fills with |
|---|---|
| `{first}` | First names of every person on the invitation: "Margaret and Peter", or "Ben, Archie and Lily" |
| `{link}` | `${base}/w/${slug}/?g=${token}` |
| `{guide}` | `${base}/w/${slug}/tomorrow?g=${token}` |
| `{photos}` | `${base}/w/${slug}/photos?g=${token}` |
| `{pending}` | Names of the invited events still awaiting a reply: "the wedding and Nicholas's 30th" |

Unknown placeholders block saving the template.

## Audience rules (campaign.audience JSON)
`{ "all": true }` · `{ "invitedTo": "wedding" }` · `{ "attending": "wedding" }` · `{ "awaitingAny": true }` · `{ "declinedAll": true }` · `{ "answer": { "event": "30th", "key": "ride", "notIn": ["No, not riding"] }, "attending": "30th" }`

Always also required:
- the invitation has a phone
- `sms_optout = 0`
- not soft-deleted
- not in `excluded`

The `reminder` campaign additionally requires that an `invite` has been sent before (`sms_out` with dedupe prefix `auto:invite:`).

## Default campaigns for a new wedding (copy from `seed/sophie-nicholas.json → campaigns` + `presets`)
| key | mode | when (wedding timezone) | audience |
|---|---|---|---|
| invite | auto (`invitation_created`) | as soon as added, within quiet hours | not yet invited |
| thanks | auto (`rsvp_changed`) | after each RSVP change, debounced 10 min | the invitation that replied |
| reminder | dates | 18 Jun, 18 Jul, 11 Aug 2027 10:00 | invited + awaitingAny |
| ride | dates | 20 Jun, 1 Aug 10:00 | attending 30th + ride ≠ No |
| nightW | dates | 17 Nov 17:00 | attending wedding |
| rain | manual | | attending wedding |
| nightB | dates | 19 Nov 17:00 | attending 30th |
| photos | dates | 19 Nov 11:00 | attending wedding |

## Autopilot algorithm (cron every 15 minutes)
```
runAutopilot(env, nowUtc):
  for each wedding with enabled campaigns:
    local = toZone(nowUtc, wedding.timezone)
    inQuiet = local.hour < wedding.quiet_start || local.hour >= wedding.quiet_end

    # 1. dated slots: claim atomically so overlapping crons can't double-claim
    UPDATE campaign_slot SET status='claimed', claimed_at=now, attempts=attempts+1
      WHERE status IN ('pending','failed') AND send_at <= now AND attempts < 5
        AND id IN (slots of enabled 'dates' campaigns of this wedding)
      RETURNING *
    for each claimed slot:
      if inQuiet: set status back to 'pending'; continue   # dated sends wait for the morning
      recipients = audience(campaign) evaluated NOW (late RSVPs included)
      enqueue(recipients, dedupe = 'slot:'+slot.id+':'+inv.id)   # INSERT OR IGNORE into sms_out
      status = flush() ok ? 'done' : 'failed' (last_error)

    # 2. auto campaigns (outside quiet hours only)
    invite: invitations with phone, no sms_out row LIKE 'auto:invite:%' → dedupe 'auto:invite:'+inv.id
    thanks: rsvp rows with updated_at > (now - 7 days) and updated_at <= now - 10min,
            and no sms_out with dedupe 'thanks:'+inv.id+':'+rsvp.max_updated_at → enqueue

    # 3. flush queued sms_out for this wedding:
    batch up to 500, POST with Idempotency-Key = hash(batch ids)
    map results → status sent/blocked/failed, provider_id, sent_at
    wallet: decrement credits by parts (M5). If the wallet would go negative, stop before sending, set the slot to 'failed', last_error='No SMS credits', and add a Needs-you item.
```
Rules:
- `INSERT OR IGNORE` on `dedupe_key` is the guarantee: nothing sends twice, even if cron overlaps or the admin also presses "Send now".
- "Send now" in the admin uses dedupe `manual:<requestUuid>:<invId>`. Show a confirm with the count and cost first.
- Wedding-week safety: a global kill switch in Settings, "Pause all texts".

## Inbound reply rules
```
onInbound(from, body, providerId):
  INSERT OR IGNORE sms_in (provider_id UNIQUE). If ignored, return (duplicate)
  inv = invitation by phone (newest active wedding first; if several weddings share the number, the one that texted it most recently)
  text = trim(body)
  if !inv: action='Unknown number' → forward to admin_mobile
  elif /^(stop|unsubscribe|opt ?out)\b/i: inv.sms_optout=1, action='Opted out'   # no reply (the provider sends the STOP confirmation)
  else:
    yes = /^(yes|y|yep|yeah|yes please|coming|attending|accept|definitely|absolutely|of course)\b/i
    no  = /^(no|n|nope|sorry|can'?t|cannot|unable|decline|regretfully)\b/i
    events = invited events
    if (yes||no) and events.length == 1:
       upsert rsvp(attending=yes, count = yes ? seats_held : existing, via='sms')
       send confirmation with dedupe 'thanks:'+inv.id+':'+rsvp.updated_at   # so the thanks autopilot doesn't double up
       action='RSVP set to yes/no'
    elif yes||no: send "{first}, you're invited to both, please reply for each here: {link}", action='Sent link'
    else: action='Needs you' → forward "Reply from <name>: <text>" to admin_mobile
  show in the admin inbox
```

## Must-pass tests (fake clock; 75 invitations; port from the prototype run)
1. Quiet hours: at 21:00 no invite sends. At 09:00, 74 invites go to everyone with a phone. A second run sends 0.
2. 30 RSVPs via the site give 30 thank-yous after the debounce. The next run sends 0. Changing an RSVP sends one new thank-you.
3. Concurrent admin edit with a stale version gets 409, and the server RSVP is preserved.
4. Inbound:
   - single-event YES: RSVP yes, count = seats, one confirmation, and no extra thank-you later
   - both-events YES: link sent, RSVP unchanged
   - question: forwarded
   - unknown number: forwarded
   - STOP: opted out of everything
   - duplicate webhook: ignored
   - bad `k`: 401
5. Reminder slot on 18 Jun 10:00 goes only to awaiting, invited, not opted-out guests. `{pending}` names only the unanswered events. Re-run sends 0.
6. Provider 403 on a slot: nothing marked sent, slot `failed`. The next run (after a credit top-up) succeeds.
7. A slot due during quiet hours (e.g. 07:00) sends at 08:00.
8. Night-before goes only to wedding yes guests, with a `/tomorrow?g=` link. The photo text goes on 19 Nov 11:00 with `/photos?g=`.
9. 300 invitations, each with 6 SMS rows: overview, exports and guest list all respond in under 500 ms.

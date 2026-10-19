# Advanced admin: everything customisable, simple to set up

**Principle: simple by default, powerful when you want it.** Every setting below must be editable in the admin, with **no code changes ever**. Most couples only ever see **Simple** mode. The visual style is the locked admin design (see DESIGN_LOCK.md). Reuse its components; no new styles.

## 1. Simple setup (first run, ~10 minutes)
A 6-step wizard, one question per screen, big buttons, with a skip on every step and progress saved:
1. Your names + wedding date
2. Venue: search the address, which auto-fills the map, parking, the BOM weather link, the nearest station and local taxis
3. Events: Wedding ✓, plus optional extra events (e.g. "30th") with date and place
4. Look: pick a theme (5 swatches) + the headline. A live preview on the right (desktop) or below (phone).
5. Guests: paste a list, upload CSV/Excel, or add later
6. Send: preview the SMS and invite → "Send to me first" → done

Smart defaults fill everything else: the run sheet template, FAQ template, text schedule, RSVP deadline (8 weeks before), and the night-before guide.

## 2. Simple vs Advanced mode
- A toggle in the top bar: **Simple** (default) / **Advanced**. Remembered per user.
- **Simple** shows the essentials: Overview, Guests, Replies, Texts, Seating, Photos, Settings basics.
- **Advanced** reveals extra panels and fields in place, marked "Advanced" in small caps. Nothing moves or reflows unexpectedly.
- Every page has a **live preview** pane (invitation, guide, SMS bubble) that updates as you type.
- Every editable item has **"Reset to default"** and **version history** (last 20 saves, one-tap restore).
- Global **search** (⌘K / the search icon): type "parking" and jump to that setting.

## 3. Everything customisable (Advanced)
**Invitation**
- Content and order: show, hide and reorder sections by drag. The visual design of each section stays locked.
- Wording: all copy (headline, date line, every section's text) and the RSVP button labels.
- Look and sound: the theme (5 locked palettes) and the envelope (on/off, seal monogram letters, music on/off + upload).
- Events: unlimited events. Each has its own name, date, place, map, dress code, run sheet, RSVP questions and an "invited to" list.
- **RSVP form builder**: per event, add questions (yes/no, choice, number, short text). Mark them required or optional, and conditional ("only if Yes"). Riding and dietary needs are just preset questions.
- FAQ: add, edit, reorder and delete questions, group them, and show a group only to a chosen event's guests.
- Registry: URL, button text, gift account card (BSB and account), on/off.
- Gallery and photo pages: on/off, filters and frames offered, moderation (auto-approve or review first).
- Parking: text, map pin and video upload.
- Transport: taxi companies (name, phone, note), shuttle times, station.
- Contacts: the "On the day, call" list.
- Weather: on/off, BOM link and the wet-weather plan text.
- Link previews: the WhatsApp/iMessage preview image and title.

**Night-before guide**
- Every section: on/off and reorder.
- Run sheet: times and places.
- Seating: tied to Seating.
- Menu: courses and choices.
- Contacts.
- When it unlocks (e.g. 6pm the night before).

**Guests**
- Fields: custom fields (e.g. "Side: bride/groom", "Shuttle", "Kids").
- Organising: tags, groups and invitations (plus-ones, kids), and which events each invitation covers.
- Tools: bulk edit, import/export, merge duplicates.

**Texts (SMS)**
- Templates: every message's wording, with {first_name}, {link} and {table} merge tags, and a live character and credit counter.
- Schedule builder: when each text goes out, who gets it (by event, reply status or tag), quiet hours, and the sender name.
- Automations: "if no reply 14 days after invite → reminder", and so on.
- Testing: test send to yourself; pause all.

**Seating**: tables (round or banquet, sizes), areas, background floor plan, rules (keep together or apart), print layout and export.

**Exports**: choose the columns for each export, saved export presets, the caterer pack and the CSV/Excel format.

**Account**
- People: co-owners (partner, planner) with roles: Owner, Editor, Viewer, Seating-only.
- Records: audit log; backups (auto daily + manual) and restore.
- Address and billing: custom domain, plan, billing and SMS credits.
- Privacy: privacy settings and data export/delete.

## 4. Safety and ease rules
- **Autosave** with a "Saved" toast; **Undo** for 10 seconds on any delete or bulk change.
- **Publish vs draft** for invitation and guide changes: edits show in the preview, then "Publish". Simple mode auto-publishes.
- Validation in plain English ("This mobile looks short: 04xx xxx xxx").
- **Empty states** explain what to do, each with one primary button.
- Every Advanced setting has a short help line plus an example.
- Works fully on phone and desktop (touch and mouse). Drag-reorder has up/down buttons as a fallback.

## 5. Data model notes
- Wedding content is stored as versioned JSON documents (`content_versions`: id, wedding_id, doc, version, published, created_by, created_at), validated by zod schemas shared by the admin and guest pages.
- New tables: `custom_fields`, `rsvp_questions` (event_id, type, label, required, condition JSON, sort), `rsvp_answers`, `automations`, `export_presets`, `members` (wedding_id, user_id, role), `audit_log`.

## 6. Done means
- A brand-new couple can go from sign-up to a sent test invitation in under 10 minutes, without opening Advanced mode.
- Every text, toggle and list on the guest pages can be changed in the admin with nothing hard-coded. Grep for couple-specific strings in `apps/web/src`: zero results.
- A Playwright test covers the wizard on a phone viewport, toggling Advanced, editing one setting per area, publishing, and checking the guest page updated.

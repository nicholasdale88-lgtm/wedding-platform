# Design deviations (need the owner's sign-off, DESIGN_LOCK.md)

Every intentional difference from `design/` is listed here. Nothing else may differ.

| # | Screen | What differs | Why | Status |
|---|---|---|---|---|
| 1 | Admin sign-in (passcode screen) | An **Email** field is added above **Passcode**, in the identical pill style. The heading shows the couple's names once this device has signed in before; on a first visit it reads "Welcome back". | Real accounts for a product sold to many couples: the server needs to know who is signing in, and before sign-in it doesn't know which wedding to name. The prototype's single shared passcode can't work for multiple couples. | Awaiting sign-off |
| 2 | Marketing (/ , /designs, /try) | Display gold #A8834A kept for large script only. Small gold type and the wordmark “Yes” use gold-ink #7A5C28, so these meet WCAG AA. The picture tiles’ cream captions sit on a deeper scrim. Colours come from one file (apps/web/src/sales/tokens.ts, checked in test/tokens.test.ts). | Small gold on cream was 3.2:1; cream-on-cream cards were 1.02:1 (review 01 P1.6, P2.1). | Awaiting sign-off |
| 3 | Sample invite (/demo and guest invite chrome) | Sample bar sits in a reserved top slot instead of position:fixed over the card. Music control and scroll cue dock in reserved chrome. Invite root clips horizontal overflow. Banner actions are 44px tall. Applied to the public sample only; real couples’ invitations (Sophie & Nicholas included) are unchanged. | The public sample is the sales proof; the bar and Music pill were covering the calendar CTA and RSVP (review 01 P1.1–P1.3, P1.7). | Awaiting sign-off |
| 4 | Homepage hero (/ ) at 390 | The live sample invitation (HeroInvite) is in the first screen on a phone, not below the fold. A still poster is the LCP; the iframe loads after. Auto-open is off when the guest asks for less motion. | Couples deciding in a few seconds need to see the invitation first (visual overhaul plan, gap 3). | Awaiting sign-off |
| 5 | Designs gallery (/designs) and admin theme picker | Tiles are 3:4 portraits of each invitation or scene, not CSS mini-envelopes. Pale covers use ink type, not cream monograms. Filter chips are 44px. | Couples pick a design like a card off a table (visual overhaul plan, gap 4; review 01 P2.5). | Awaiting sign-off |

## 18 Nov 2026: graphics redo (additive; the locked designs untouched)

- **Design covers** (/designs, admin Theme gallery): each design's tile is now a still of its own closed
  envelope or scene (apps/web/public/covers, under 30 KB each, lazy), photographed from the sample with the
  sample couple's names, Harriet & Theo, matching their H&T seal. The sample's live invitation is still
  addressed to its guests (Emma & Tom). The locked designs themselves are unchanged; only their tiles are new.
- **Three flagship Signature designs**, beside the existing ones: Hunter Valley Vineyard Sunset, Botanical
  Ivory Arch, Coastal Garden. Our own artwork (tools/themes/flagships.py), served as layered SVG (vector:
  sharper and smaller than AVIF/WebP for this art, about 20–25 KB compressed for the closed scene). The
  closed scene loads first; the two nearer layers load on the tap. Opening about 2.8 s, transform and opacity
  only; less motion: the still scene and a fade.
- **Openings, all scenes** (not the flagships, which have their own): light spills out of the opening as it
  parts and specks of light drift through; as the scene clears the camera carries on through it onto the card
  (a small push as it fades). The Signature list leads with the finished scenes (flagships, Doors, Bow,
  Letter, Curtain, Photograph); Book, Barn, Gates and Beach come last until brought up to the same bar.
- **Ornaments** (looks.css: Romantic sprig, Garden corner, Luxe corners): fine line art in the design's own
  foil colour (--fgo), replacing filled ellipse leaves (tools/themes/ornaments.py).
- **Falling petals and leaves**: three shaded shapes each (masks, recolourable through --yl-p1/2 and
  --yl-l1/2), turning over as they fall (transform only), replacing rounded blobs.
- **Textures**: a wax mottle tiled over every seal (public/textures/wax.svg, 96 px) and brushed streaks on the
  gold-foil liner (public/textures/foil.svg, 120 px). The envelope's timings and flap are unchanged.

## 26 Nov 2026: launch simplification (send-09, Iris's build-specs-01, approved by Nick)

| # | Screen | What differs | Why | Status |
|---|---|---|---|---|
| S6 | Pricing (/ #pricing, sign-up, Settings → Plan & billing, Terms, the sample's bar) | One plan, The Yes List, A$87 once (config: PLAN_PRICE_CENTS). One centred card with ticks, a muted "Text messages, if you want them, at cost." line and one "Get started" button. No Basic / Essentials / Deluxe cards, no comparison table, no "Most popular", no plan pills in the sample. Nothing is behind a plan; texting waits until the plan is paid and credits are bought. Stored plan values are kept, so older rows work and nobody is charged twice. | Launch simplification (Job 6; price set by Nick at A$87). | Awaiting sign-off |
| S3 | Settings (one menu item) | Five sections in order: Profile (details, sign-in, privacy, backup and checks, Colours), Plan & billing, Text credits (balance or Unlimited, Buy / Top up at cost, purchase history, texting settings once on), Partner access, What you’re using (a 44×26 switch per optional tool). Optional tools are per-wedding switches (content.tools): new weddings start with them off, weddings from before the switches (Sophie & Nicholas) keep everything on, the sample has seating on. Off hides a tool's pages, which then offer "Switch this on in Settings"; nothing is deleted. Texts show only once credits are bought, and buying turns them on. | Launch simplification (Job 3). | Awaiting sign-off |
| S4 | Couple admin chrome | Plain words: Setup → Invitation ("Your invitation", eyebrow "The wedding · Invitation"), Wedding planner → Plan, Dietary → Meals & allergies, Admin look → Colours; "RSVP admin" dropped from the sidebar; back links read "← Home". Guest-facing wording, the locked sign-in screen and the Sophie & Nicholas artwork are unchanged. | Launch simplification (Job 4). | Awaiting sign-off |
| S1 | Couple menu (sidebar and phone sheet) | Five items on every screen size: Home, Guests, Invitation, Plan, Settings. No Account item, no second Overview, no Events heading, no 3-column tiles. Switched-on tools nest under their place (Messages and Texts under Guests, Photos under Invitation, Wedding party under Plan). Two or more events: a compact switcher in the header, the menu stays five. Phone: sticky header (seal, names, switcher, ?, ☰), a sheet of 56px rows, a 44px close, a full-width Sign out. /admin/:wid lands on the wedding's overview; Account's dashboard stays behind a link in Settings; every old address still works. | Launch simplification (Job 1). | Awaiting sign-off |
| S9 | Event switcher (top of the sidebar; top of the phone menu) | The current event's name and date; tapped, every event on the account (name, date, role) with the current one ticked; one tap switches to its Home (remembered); "+ Create new event" makes another with its own plan, tools and text credits. Unused text credits can be moved between your own events. | Launch simplification (Job 9, Nick 25 Nov). | Awaiting sign-off |
| S2/S5 | Home (each event's overview) | One Home: the cover and four figures, then "Next 3 things" (three rows from the couple's real state: the look, names and reply-by, first guests, sharing, messages; texts only once on) beside "Coming up", a real calendar (replies close, each event's day, dated texts once texts are on; folds and remembers). The donut, latest replies and "See what everyone else sees" fold under "More on Home". The quick-action pills are gone; the planning dashboard and "Rehearse your day" live in Plan. Account's dashboard is no longer the landing page. | Launch simplification (Jobs 2 and 5). | Awaiting sign-off |
| S7 | Invitation page, guest drawer, /try | One Invitation tab (with the event's Details and Timeline) until the extra pages are switched on: Night-before, Photo and Thank-you pages follow Settings → What you're using; a muted "Add a night-before or thank-you page" link. A full-width "Print one invitation · for a guest who'd rather have paper" pill; each guest has "Print one invitation for them" (printed and digital, with their address). /try: the date says Day / month / year (en-AU); "Try every plan, side by side" is now "Everything in one sample wedding". | Launch simplification (Job 7). | Awaiting sign-off |
| S10 | Front page (/) | No vendors on the front page: the header's, phone menu's and footer's "Vendor directory" links are removed. "Wedding vendor? List your business free" stays (for vendors to join); /vendors itself is unchanged. | Send-09 (Forge): no vendor directory on the home page. | Awaiting sign-off |

# Design deviations (need the owner's sign-off, DESIGN_LOCK.md)

Every intentional difference from `design/` is listed here. Nothing else may differ.

| # | Screen | What differs | Why | Status |
|---|---|---|---|---|
| 1 | Admin sign-in (passcode screen) | An **Email** field is added above **Passcode**, in the identical pill style. The heading shows the couple's names once this device has signed in before; on a first visit it reads "Welcome back". | Real accounts for a product sold to many couples: the server needs to know who is signing in, and before sign-in it doesn't know which wedding to name. The prototype's single shared passcode can't work for multiple couples. | Awaiting sign-off |
| 2 | Marketing (/ , /designs, /try) | Display gold #A8834A kept for large script only. Small gold type and the wordmark “Yes” use gold-ink #7A5C28, so these meet WCAG AA. The picture tiles’ cream captions sit on a deeper scrim. Colours come from one file (apps/web/src/sales/tokens.ts, checked in test/tokens.test.ts). | Small gold on cream was 3.2:1; cream-on-cream cards were 1.02:1 (review 01 P1.6, P2.1). | Awaiting sign-off |
| 3 | Sample invite (/demo and guest invite chrome) | Sample bar sits in a reserved top slot instead of position:fixed over the card. Music control and scroll cue dock in reserved chrome. Invite root clips horizontal overflow. Banner actions are 44px tall. Applied to the public sample only; real couples’ invitations (Sophie & Nicholas included) are unchanged. | The public sample is the sales proof; the bar and Music pill were covering the calendar CTA and RSVP (review 01 P1.1–P1.3, P1.7). | Awaiting sign-off |

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

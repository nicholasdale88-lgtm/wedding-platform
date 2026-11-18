# Design deviations (need the owner's sign-off, DESIGN_LOCK.md)

Every intentional difference from `design/` is listed here. Nothing else may differ.

| # | Screen | What differs | Why | Status |
|---|---|---|---|---|
| 1 | Admin sign-in (passcode screen) | An **Email** field is added above **Passcode**, in the identical pill style. The heading shows the couple's names once this device has signed in before; on a first visit it reads "Welcome back". | Real accounts for a product sold to many couples: the server needs to know who is signing in, and before sign-in it doesn't know which wedding to name. The prototype's single shared passcode can't work for multiple couples. | Awaiting sign-off |

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

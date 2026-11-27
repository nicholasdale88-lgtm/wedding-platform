# Marketing images and sales-page fixes (send-10)

Before and after, at 390 (phone) and 1280 (computer), taken by the Screens workflow
(`apps/e2e/screens/marketing.mjs`, branches `screens/marketing-before` and `screens/marketing-after`) on a
local build. `before-*` is the code as it was on main (b78190b), `after-*` is send-10.

Every product preview now uses one style: one iPhone frame (`apps/web/src/sales/PhoneFrame.tsx`: black bezel,
Dynamic Island, never rotated), one shadow (`0 18px 40px rgba(70,40,40,.12)`), one size (256px on a phone,
280px on a computer), on the cream page. Every closed envelope is the same still of the sample, photographed
from the app itself: `/demo?embed=1&sales=1` (H&T seal, "Tap to open", Harriet & Theo).

## Old image → new image

| Where | Old | New |
|---|---|---|
| Home hero (first paint) | Drawn envelope (`RealEnvelope`, cream, Sandstone wax) addressed **Emma & Tom**, in a heavier-shadow phone at 264/300px | `public/marketing/sample-closed-390.webp` (new, 780×1688, 19 KB) in `PhoneFrame` |
| Home hero (live) | `/demo?embed=1&play=1`: opened by itself; three text bubbles over the phone, one a toast "Emma & Tom are coming · guest list updated" | `/demo?embed=1&sales=1`: closed until a tap, "Tap to open", Harriet & Theo; nothing over the phone |
| Paper or The Yes List: phone | Drawn envelope (`RealEnvelope compact`, **Emma & Tom**) in a separate gradient phone (46px radius, its own shadow) | The same still in `PhoneFrame` |
| Paper or The Yes List: paper card | Venue line "LARKWOOD ESTATE · HUNTER VALL…" cut by the pressed border | Two lines: LARKWOOD ESTATE / HUNTER VALLEY, NSW (same drawing) |
| Opened like a gift | Frameless square drawn envelope (**Emma & Tom**), 30px corners, its own shadow | The same still in `PhoneFrame` |
| And everything after the yes | Three CSS mockups (seating, guest list, budget) in tilted frames (a fan), own shadow; first guest **Emma & Tom** | The same three mockups in `PhoneFrame`, in a row (one on a phone, three on a computer); first guest Grace & Oliver |
| Colour tiles ("Your envelope, your seal", "Every colour you love") | Drawn envelopes, bare (seal only), heavier shadow | Unchanged drawings, the one preview shadow |
| /designs phone | Live design in the hero's old frame, addressed to the sample guests | Live design in `PhoneFrame`, sales mode (the couple's names, waits for a tap) |
| /demo's own first paint | `public/marketing/demo-poster-390.webp` | Unchanged (it's the full sample, addressed to its guests) |

## Shots

| Name | What |
|---|---|
| `*-home-hero-{390,1280}` | The first screen as it paints |
| `*-home-hero-later-{390,1280}` | The same screen five seconds later (before: opened by itself, toast over the phone; after: still closed) |
| `*-home-paper-*` | Paper or The Yes List |
| `*-home-envelope-*` | Opened like a gift |
| `*-home-after-yes-*` | And everything after the yes |
| `*-home-pricing-*` | Pricing (before: "$87" and a $39 third-event price; after: A$87 only, from the price config). The $50/$88/$98 plan cards Sentinel saw on the live site were already gone with send-09; "From $87, paid once" under the paper pair is now "A$87, paid once". |
| `*-home-footer-*` | Footer (before: "Wedding vendor? List your business free"; after: none) |
| `*-home-menu-390` | The phone menu |
| `*-home-full-*` | The whole front page |
| `*-try-*` | /try (after: the date as dd/mm/yyyy) |
| `*-designs-*` | /designs |

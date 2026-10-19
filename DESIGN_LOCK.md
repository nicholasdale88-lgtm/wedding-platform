# DESIGN LOCK: the graphics are final. Do not redesign anything.

The owner has **locked in** every visual in `design/`. Claude Code's job is to **build the working product behind these exact visuals**, not to improve, modernise or reinterpret them.

## What "locked" means
- **Pixel-match** every screen in `design/` at 375×812 (phone) and 1280×800 (desktop). Visual diff tolerance: ≤ 2% (Playwright `toHaveScreenshot`).
- **Do not change**: colours, fonts, font sizes and weights, letter-spacing, spacing, borders, radii, shadows, textures, icons, illustrations, layout, section order, animation timings and easings, or copy wording.
- **Envelope** (`design/Sophie and Nicholas Invitation.html`):
  - same flaps, colours and crosshatch
  - same seam lines and opacities
  - same wax seal, rings, sparkles and petals
  - timing: open at 1.5 s, card at 2.7 s, envelope gone at 4.6 s
  - no glow flash
- **Invitation sections**: the same shapes (arched tops, notched corners, dashed inner borders), backgrounds, pattern and paper texture, and the blue 30th panel.
- **Night-before guide**: the same hero photo, place cards, floor plan style, dark sage reception section and order.
- **Photo upload page**: as designed.
- **Admin**: the same sidebar, ruled sections, pills, drawer and toasts (see CHANGES 0g).
- Fonts: Cormorant Garamond, Pinyon Script, DM Sans (Google Fonts, self-hosted for speed). Do not substitute.

## How to reproduce the visuals exactly
- **Copy the inline style values straight out of the design files.**
  - Convert them to Tailwind arbitrary values or CSS modules **verbatim**, e.g. `clip-path:polygon(0 0,100% 0,50% 56%)`, `cubic-bezier(.45,0,.15,1)`.
  - Don't "round" to the Tailwind scale.
- SVG assets (seal, sprigs, icons, textures, seam overlay) are extracted **as-is** from the design files into `apps/web/src/assets/svg/`.
- The bundled invitation's source template is the JSON inside `<script type="__bundler/template">`. Parse it (`JSON.parse`) to read the exact markup and styles.
- `assets/lookout.jpg` is the hero/background photo; keep it.

## What Claude Code may change
- Only **non-visual internals**: replace fake data and localStorage with the real API, real uploads, real SMS, auth, accessibility attributes (aria, focus order), and performance (lazy-load, image sizes).
- If a design element can't work technically, **stop and ask the owner** with a screenshot of the issue. Don't silently alter it.
- New screens the design doesn't have (onboarding wizard, super-admin, login, error pages) must **reuse the existing admin components and tokens only**. No new colours, fonts or styles.

## Visual tests (add to M6, but start using them from M2)
- Run each design file in a headless browser and record a reference screenshot per screen and state. That includes:
  - envelope closed, mid-open and open
  - RSVP before, after Yes and sent
  - the guide's table dropdown open
  - every admin tab
- The real app must match within 2%. Any intentional difference needs the owner's sign-off, noted in `docs/DESIGN_DEVIATIONS.md`.

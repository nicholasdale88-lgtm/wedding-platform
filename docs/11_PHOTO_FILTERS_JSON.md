# Photo filters & frames: designed in Claude Design, integrated by Claude Code

The **source of truth** is `design/filters.json`, exported from `design/Photo Filter Studio.dc.html` (the "Export filters.json" button). If that file isn't there yet, open the studio and use its defaults (identical to the DEF/FRAMES arrays in the studio's logic class).

## Build rules
- Load `filters.json` as seed data for each wedding (`wedding_settings.photo_filters`).
- The admin gets **Photos → Filters & frames**: the same studio UI (sliders, tint, new/delete, frame picker, try-your-own-photo) built into the admin.
  - Couples can design their own filters, and choose which filters and frames guests see.
  - Owner/super-admin can also upload a filters.json to replace the set.
- The guest upload editor (docs/09 §D2) renders each filter by:
  1. Canvas `ctx.filter = cssFilter`
  2. tint fill with `globalCompositeOperation='soft-light'` at `tintOpacity`
  3. a radial vignette (transparent at 48% radius → rgba(20,18,12,vignette) at the edge)
  4. a grain noise tile at `grain` opacity, using the 'overlay' blend
  - Fallback where `ctx.filter` is unsupported (older Safari): apply the same maths per pixel (brightness, contrast, saturate, sepia, hue-rotate, grayscale matrices).
- Frames are drawn on the canvas at export size from the frame fields:
  - `bg`, `pad` (CSS padding, scale relative to a 460px-wide reference), `rad`, `clip` (notched polygon)
  - `ruled` + `line` (inset 9px hairline), `photoRad`, `photoLine`
  - `cap` (names + date beneath, Pinyon Script / DM Sans), `overlayCap` (names over a bottom gradient), `seal` (wax-seal monogram, bottom-right)
  - Text comes from `couple.names`, `couple.date` and `couple.monogram`, which are editable per wedding.
- **Text**: `text.default` {on, text, font: script|serif|caps, pos: top|center|bottom, color, size}. Drawn last, with a soft shadow on light colours and a gradient scrim behind it. The guest editor shows presets + a text box (max 60), and wraps long text onto 2 lines.
- Frames may set `textInsetTop` (e.g. Arch `24%`): top-positioned text starts that far down so the curve never crops it. Test every frame × text position.
- **Preview = output**: the CSS preview in the studio and the canvas render must match (Playwright visual test per filter × frame, ≤3% diff).
- Original + edited both stored; `media.edit` saves `{filterId, frameId, crop, rotate}`.

## Format (v1)
```json
{ "version": 1,
  "couple": { "names": "Sophie & Nicholas", "date": "18.11.27", "monogram": "S&N" },
  "filters": [{ "id": "valley-warm", "name": "Valley Warm", "b":104,"c":105,"s":110,"sep":18,"hue":0,"gs":0,
     "tint":"#f2c48a","tintAmt":30,"vig":20,"grain":0,
     "cssFilter":"brightness(104%) contrast(105%) saturate(110%) sepia(18%) hue-rotate(0deg) grayscale(0%)",
     "overlay": { "tint":"#f2c48a","tintOpacity":0.3,"blend":"soft-light","vignette":0.2,"grain":0 } }],
  "frames": [{ "id":"polaroid","name":"Polaroid","bg":"#fbf8f2","pad":"16px 16px 6px","cap":true, "...": "..." }],
  "defaultFrame": "polaroid" }
```

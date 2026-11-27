# Simplify re-shoot after send-10 and send-10b (375, 390, 1280)

Taken by the Screens workflow (`apps/e2e/screens/simplify.mjs`, `WIDTHS=375,390,1280 EXTRA=1`, branch
`screens/simplify2-after`) on a local build, for Sentinel's retest of b78190b (A to J).

| Shot | Checks |
|---|---|
| `after-sign-in-*` | B: "Your wedding admin · private" |
| `after-sample-admin-*` | A: the sample couple admin (/admin/demo) opens straight away, no trial booked, no 401 |
| `after-sales-home-*`, `after-sales-pricing-*` | C to F, I: no vendor links, Harriet & Theo, the closed still in the one phone frame, A$87 and Start your wedding above the fold on a phone |
| `after-try-*` | dd/mm/yyyy date |
| `after-vendor-sample-*` | H: Next 3 things and All requests above the tab bar on a phone |
| `after-vendor-sample-requests-*` | H: the stage chips wrap (Quoted whole) |
| `after-vendor-home-*` | J: "within 2 business days" on a new listing |
| `after-admin-*` | The couple's admin (Home, menu, Settings, Invitation, Guests) |

G (the paper card's venue) is in `docs/screens/marketing-01/after-home-paper-*`.

# Staging: try changes safely before they go live

There are now two copies of The Yes List:

| | Live site | Staging (test copy) |
|---|---|---|
| Address | wedding-platform-nd.pages.dev (and your own domain, once set) | **https://wedding-platform-nd-staging.pages.dev** |
| Comes from the branch | `main` | `staging` |
| Data | the real couples and guests | its own separate database, with made-up sample guests |
| Texts and emails | sent for real | **never sent** (staging has no SMS or email keys and no 15-minute timer) |
| Payments | real Stripe | off |
| Look | normal | an orange **STAGING** strip along the bottom of every page |

Nothing done on staging can change, text or email anyone on the live site. They share nothing except the code.

## The routine

1. **New work goes to `staging` first.** Ask Claude: "put this on staging". It pushes to the `staging` branch.
2. **Wait for the green tick.** GitHub runs the same checks as for live, then puts the change on the staging address. This takes about 5 to 10 minutes. You can watch it on GitHub under **Actions**.
3. **Check it at the staging address.** Sign in at `https://wedding-platform-nd-staging.pages.dev/admin` with the same email and passcode as live. Click around, try the change, look at it on your phone.
4. **Happy? Send it live.** Ask Claude: "merge staging into main". The same checks run again and the live site updates. If something is wrong, say so and it gets fixed on staging first; live is untouched.

Urgent fixes can still go straight to `main` if they must. Afterwards, ask Claude to bring `staging` up to date with `main` so the two don't drift apart.

## Good to know

- **Same sign-in, separate session.** Your owner email and passcode work on both, but being signed in on one doesn't sign you in on the other.
- **Staging data is for playing with.** Add, delete and break anything. It is never copied to live, and live is never copied to it. Changes to the database layout (migrations) run on staging first, so problems show up there.
- **Texts on staging don't go out.** Pressing "Send" there fails quietly with a "not set up" kind of message: that's expected.
- **Search engines never list staging.** Every page is marked "do not index".
- **Free.** Staging uses the same free Cloudflare allowances as live (one more Worker, database and website, well within the free limits).

## For whoever maintains it

- Deployed by `scripts/deploy-staging.sh`, run by the `deploy-staging` job in `.github/workflows/ci.yml` on pushes to `staging`, after the `check` job passes.
- Separate Cloudflare resources, created on the first run if missing: Worker `wedding-api-staging`, D1 `wedding-db-staging`, R2 `media-staging`, Pages project `wedding-platform-nd-staging` (its `/api/*` is bound to `wedding-api-staging`). The script rewrites the checked-out `wrangler.toml` files at deploy time and stops if any live name remains.
- The staging Worker gets only `SESSION_SECRET` (its own, generated once in Cloudflare), `SUPER_ADMINS`, and vars `PUBLIC_BASE_URL` and `STAGING=1`. No `MM_*`, `TEXTO_*`, `RESEND_*`, `STRIPE_*` or OAuth secrets. Cron triggers are emptied.
- The banner and `noindex` are added to the built `index.html` / `_headers` by the script, so app code doesn't change.
- To reset staging data: delete the `wedding-db-staging` database in the Cloudflare dashboard and push to `staging` again; it is recreated and re-seeded.

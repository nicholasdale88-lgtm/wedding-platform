# 01: Stack and budget (supersedes the stack suggestions in README.md)

## Why Cloudflare
The SMS autopilot must run **every 15 minutes**, and the product must be sellable (commercial use).
- **Vercel Hobby** limits cron jobs to once a day and is for non-commercial use, so it's out.
- **Cloudflare's free plan** includes Workers, Pages, D1 (SQLite), R2 object storage with free egress, and Cron Triggers, and allows commercial use. One platform, one bill (A$0).

Check current limits at developers.cloudflare.com/workers/platform/pricing before launch.

| Need | Service | Free allowance (approx.) | Our use |
|---|---|---|---|
| API + cron | Cloudflare Workers | 100k requests/day, 5 cron triggers | Under 5k/day even on wedding week |
| Database | Cloudflare D1 | 5 GB, 5M row reads/day | Under 10 MB per wedding |
| Photos/video/music | Cloudflare R2 | 10 GB stored, free egress | ~2–5 GB per wedding (resize photos, cap video) |
| Website | Cloudflare Pages | Unlimited static | All UI |
| Login emails (later) | Resend | 3,000/month | Magic links for couples |
| Payments (later) | Stripe Payment Links | No monthly fee | Only per-sale fees |

## The A$150 budget
| Item | Cost (AUD, approx.) | Notes |
|---|---|---|
| Claude Pro (includes Claude Code) | ~$32/month × 2–3 months = **$64–96** | Main cost. Build in focused sessions (see below) |
| Domain (Cloudflare Registrar, at cost) | **~$15–20/year** | e.g. `sophieandnicholas.com`, or a product name |
| Mobile Message SMS credits | **~$18–30** | 1,000–1,500 credits at 1.6¢ + GST, bought within 30 days of signup. Credits never expire. The whole wedding is about 250–400 texts (75 invitations), so the rest is spare for testing |
| Cloudflare, Resend, Stripe | **$0** | Free tiers |
| **Total** | **~$97–146** | Leave about $10 buffer |

Do **not** buy Mobile Message credits until milestone M4 starts, because the 1.6¢ price only applies within 30 days of signup. Sign up at M4, test with the 50 free credits, then buy.

## Making Claude Pro last
- Use the default model (Sonnet). Only switch to a bigger model for a stubborn bug.
- One task per session: open `docs/06_MILESTONES.md`, do the next unticked task, commit, then `/clear`.
- Don't paste the whole design file. Point Claude Code at the exact file and section (e.g. "design/Night Before Guide.dc.html, the Finding the ceremony section").
- If you hit the usage limit, stop and continue after the reset rather than upgrading.
- Expect about 40–60 focused sessions for M1–M6.

## Not doing (to stay in budget)
- No paid email provider, no paid monitoring (use Cloudflare logs plus a free Sentry developer plan if wanted), no Vercel/Netlify, no Google APIs, no image CDN (resize in the browser before upload).
- Video transcoding: none. Cap uploads at 200 MB and MP4/MOV only, and play with the native `<video>`.

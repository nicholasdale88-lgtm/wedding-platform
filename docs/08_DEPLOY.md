# 08: Deploy and go-live checklist

## One-time setup (Claude Code will run most of these with you)
```bash
pnpm i
npx wrangler login
npx wrangler d1 create wedding-db            # copy the database_id into apps/api/wrangler.toml
npx wrangler r2 bucket create media
npx wrangler d1 migrations apply wedding-db --remote
npx wrangler secret put SESSION_SECRET       # paste: openssl rand -base64 32
npx wrangler secret put MM_USER
npx wrangler secret put MM_PASS
npx wrangler secret put MM_HOOK_SECRET       # paste: openssl rand -hex 16
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID     # R2 > Manage API tokens > Object Read & Write on bucket "media"
npx wrangler secret put R2_SECRET_ACCESS_KEY
pnpm --filter api deploy
pnpm --filter web build && npx wrangler pages deploy apps/web/dist --project-name wedding-web
pnpm seed:remote                             # creates Sophie & Nicholas
```
- R2 CORS: allow `PUT` from your domain (needed for direct uploads).
- Custom domain: Pages project → Custom domains → add `yourdomain.com`. Worker route `yourdomain.com/api/*`.
- Mobile Message dashboard webhooks:
  - Inbound: `https://yourdomain.com/api/hooks/mm/inbound?k=<MM_HOOK_SECRET>`
  - Delivery: `https://yourdomain.com/api/hooks/mm/status?k=<MM_HOOK_SECRET>`

## Go-live for Sophie & Nicholas
- [ ] Real guest list imported. "Needs you" shows no bad or shared mobiles.
- [ ] Every event, time and address checked in the preview as 3 different guests (wedding only, 30th only, both).
- [ ] Music MP3 uploaded. Tested on an iPhone with the silent switch both ways.
- [ ] Test texts to your own phone for each campaign. Links open the right personal page.
- [ ] Reply YES/NO/STOP/a question from your phone. Inbox shows each correctly.
- [ ] Credits balance ≥ 1.5× the "All messages" estimate in Settings.
- [ ] Backup downloaded.
- [ ] Turn the invite autopilot on. Watch the first 5 sends arrive, then leave it.

## Wedding week
- [ ] Seating finished. The guide checked as 3 guests. Parking video plays on mobile data.
- [ ] Menu and meals entered. Venue export sent to Glenworth Valley. Caterer export sent for the 30th.
- [ ] Rain text ready (manual). The "Pause all texts" switch is known.

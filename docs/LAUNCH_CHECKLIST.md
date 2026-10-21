# Launch checklist (this weekend)

Everything the code needs is built and tested. What's left is switching services on and a few decisions
only the owner can make. Each secret goes in GitHub → the repo → Settings → Secrets and variables →
Actions → New repository secret; the next deploy passes it to Cloudflare. Settings → System check in the
admin then shows each one as working.

## Must have before taking real couples

1. **Email (Resend, free for 3,000 a month).** Without it: no "Forgot your passcode?" emails, no daily
   summaries, no vendor enquiry emails, no wedding-party invitation emails.
   - Sign up at resend.com, add your domain, add the DNS records it shows, wait for "Verified".
   - Secrets: `RESEND_API_KEY` (re_…) and `EMAIL_FROM` (e.g. `The Yes List <hello@your-domain>`).
2. **Texting.** Without it couples can't send invitations or reminders by text (sharing links still works).
   - Mobile Message: `MM_USER`, `MM_PASS`, `MM_HOOK_SECRET` (any long random string); or Texto:
     `SMS_PROVIDER` = `texto`, `TEXTO_API_KEY`, `TEXTO_WEBHOOK_SECRET`. Top up some credit.
3. **Card payments (Stripe; no monthly fee, about 1.7% + 30c a card payment in Australia).** Without it,
   upgrading means the couple asks and you send a payment link by hand (that still works).
   - Create a Stripe account, finish the business details, then Developers → API keys → Secret key:
     secret `STRIPE_SECRET_KEY` (sk_live_…; use sk_test_… first to try it).
   - Developers → Webhooks → Add endpoint: `https://<your site>/api/hooks/stripe`, event
     `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET` (whsec_…).
4. **Legal pages.** /privacy, /terms and /contact are drafts. Fill in the business name and ABN, your
   state, and the contact email (they're marked in `apps/web/src/sales/Legal.tsx`), and have them read
   by someone qualified. Payment providers and email providers expect them.
5. **Prices.** Essentials $28, Deluxe $35, extra event $39 (packages/shared/src/plan.ts). Confirm.

## Strongly recommended

6. **Your domain.** Buy it (Cloudflare Registrar is at cost), add it to the Cloudflare Pages project
   (Custom domains), then set the site address in one place (see docs/08_DEPLOY.md). Old
   wedding-platform-nd.pages.dev links keep working. Do this before Resend (email comes from the domain).
7. **Nightly encrypted database copy.** Secret `BACKUP_PASSPHRASE` (a long passphrase you keep safe).
8. **Photo storage links for couples.** Google Drive, Dropbox and OneDrive need app keys:
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`,
   `MS_CLIENT_ID`/`MS_CLIENT_SECRET` (docs/SETUP_ACCOUNTS.md → "Photo storage links"). Google needs its
   app verified before strangers can connect (allow a few days); Dropbox and OneDrive are quicker.
9. **The planning assistant.** Add the Workers AI permission to the Cloudflare API token used by the
   deploy (free daily allowance).

## Try it yourself once everything's on (20 minutes)

- On the front page, sign up as a new couple with a different email: your invitation should open with
  your names and date, then Make it yours.
- Fill in the [placeholders] (Setup → Wording → Still to fill in), add three guests with your own mobile,
  send yourself the invitation, reply by text, and check Guest list and the daily summary at 6pm.
- Upgrade with a Stripe test card (4242 4242 4242 4242) and check the plan switches on by itself.
- Forgot your passcode: request it, use the link, sign in.
- List a test vendor at /vendors/join, enquire from another browser, check the vendor's email.
- Settings → System check: everything should show ✓.

## Known gaps (fine for launch)

- The demo at /demo is a look-alike of the invitation, not the real design.
- Print pages use the saved seating plan, not necessarily the one published to guests.
- Birthdays and other events beyond the wedding use the first design's look; they aren't marketed yet.

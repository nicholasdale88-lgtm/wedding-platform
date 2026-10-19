# Setting up the outside services

A step-by-step list of every account this platform uses, in the order you'll need them. You don't need Node on your computer: GitHub runs the tests and Cloudflare hosts the site.

**Never paste a password, API key or token into chat with Claude.** Each key goes into exactly one place, named in the step below.

| # | Service | Needed by | Cost |
|---|---|---|---|
| 1 | GitHub | Now | Free |
| 2 | Cloudflare | M1 deploy | Free |
| 3 | Domain name | Before M4 (first real text) | ~A$15–20/year |
| 4 | Mobile Message (SMS) | M4 | ~A$18–30 credits |
| 5 | Resend (login emails) | M5 | Free |
| 6 | Stripe (selling) | M5 | Per-sale fees only |
| 7 | Sentry (error alerts) | M6, optional | Free |

---

## 1. GitHub: where the code lives and the tests run (now)
1. Go to **github.com/signup** and create an account. If you already have one, skip this.
2. Go to **github.com/new**:
   - Repository name: `wedding-platform`
   - Choose **Private**.
   - Leave **all** the "Initialize" boxes unticked: no README, no .gitignore, no licence.
   - Click **Create repository**.
3. Copy the repo address (e.g. `https://github.com/yourname/wedding-platform`) and paste it to Claude.
4. When Claude first pushes, a **"Sign in to GitHub"** window opens in your browser. Sign in and click **Authorize**. Git remembers this, so you only do it once.
5. Check it worked: open the repo, click the **Actions** tab, and you should see a run called **CI**. A green tick means every test passed. A red cross means Claude needs to fix something.

## 2. Cloudflare: hosting, database, file storage, scheduled texts (M1)
1. Go to **dash.cloudflare.com/sign-up**, create an account and verify your email.
2. **Copy your Account ID.** Dashboard home → **Account Home** → **⋯ next to your account → Copy account ID**. It's also in the right-hand column of any domain's Overview page.
3. **Create an API token** so GitHub can deploy for you:
   - Go to **My Profile → API Tokens → Create Token**.
   - Use the **"Edit Cloudflare Workers"** template.
   - Add these permissions: **Account → D1 → Edit**, **Account → Workers R2 Storage → Edit**, **Account → Cloudflare Pages → Edit**.
   - Account Resources: your account. Zone Resources: **All zones** (or just your domain once you have one).
   - Click **Continue → Create Token** and copy the token. It's shown **once only**.
4. **Put both into GitHub, not into chat:**
   - In your repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
   - Name `CLOUDFLARE_API_TOKEN`, with the token as the value.
   - Name `CLOUDFLARE_ACCOUNT_ID`, with the Account ID as the value.
5. **R2 storage keys** (for photo and video uploads):
   - Go to **R2 Object Storage**. If it asks, add a payment card: it's free up to 10 GB and the card is only for overage.
   - Go to **Manage R2 API Tokens → Create API token**, with permission **Object Read & Write**, applied to the bucket `media`. Claude creates the bucket on the first deploy; if it doesn't exist yet, choose "all buckets".
   - Add three more GitHub secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID` (the same Account ID as before).
6. **Session secret:** add a GitHub secret `SESSION_SECRET` holding any 40+ random characters. A password manager's generator is fine.
7. Tell Claude "Cloudflare secrets are in". The deploy workflow then creates the database, the storage bucket and the 15-minute timer for you.

## 3. Domain name (before the first real text)
Guests' links will use this address, e.g. `sophieandnicholas.com`.
1. In Cloudflare, go to **Domain Registration → Register Domains**, search for the name and buy it. It's sold at cost, about A$15–20 a year.
2. Tell Claude the domain. Claude adds it to the site (Pages → Custom domains) and points `/api/*` at the server. HTTPS is automatic.
3. **R2 CORS** (lets phones upload straight to storage): Claude sets this by deploy. To check it, go to **R2 → media → Settings → CORS policy**, which should allow `PUT` from `https://yourdomain`.

## 4. Mobile Message: the SMS service (start of M4, not before)
The cheap 1.6¢ rate only applies to credits bought **within 30 days of signing up**, so don't sign up early.
1. Sign up at **mobilemessage.com.au**. You get 50 free credits for testing.
2. **Claim your free dedicated number**, usually under **Numbers** or **Dedicated numbers**. This is the number guests' texts come from and reply to. Copy it.
3. **API credentials:** go to **Settings → API** and create an API key, then copy the **API username** and **API password**.
4. **Webhook signing secret:** under **Settings → API**, create a **webhook signing secret** and copy it.
5. **Add these GitHub secrets:**
   - `MM_USER`: the API username.
   - `MM_PASS`: the API password.
   - `MM_SIGNING_SECRET`: the webhook signing secret.
   - `MM_HOOK_SECRET`: any 32 random characters you make up.
6. **Paste the dedicated number** into the admin under **Settings → Texts → Sender number**. Put **your own mobile** in the same section, under "Forward replies to". These are settings, not secrets.
7. **Set the two webhooks** in the Mobile Message dashboard (the webhooks / inbound settings). Replace `yourdomain.com` with your domain, and use your `MM_HOOK_SECRET` value for `MM_HOOK_SECRET`:
   - **Inbound messages:** `https://yourdomain.com/api/hooks/mm/inbound?k=MM_HOOK_SECRET`
   - **Delivery receipts:** `https://yourdomain.com/api/hooks/mm/status?k=MM_HOOK_SECRET`
8. **Test** from the admin: **Settings → Send a test to me**. Then reply **YES**, **NO**, a question and **STOP** from your phone, and check each one appears in **Texts → Replies**.
9. **Buy credits within 30 days** (M4.6). About 1,000–1,500 credits covers the whole wedding with spare.

## 5. Resend: login emails for couples (M5)
1. Sign up at **resend.com**. The free tier is 3,000 emails a month.
2. Go to **Domains → Add Domain**, enter your domain and copy the DNS records it shows.
3. In Cloudflare, go to **your domain → DNS → Records → Add record** and add each record exactly as Resend lists it. Wait for Resend to show **Verified**, which usually takes minutes.
4. Go to **API Keys → Create API key** with **Sending access**, and add it as the GitHub secret `RESEND_API_KEY`.

## 6. Stripe: taking payments from other couples (M5)
1. Sign up at **stripe.com** and complete **Activate payments**: business details, ABN and bank account.
2. Stay in **Test mode** (the toggle at the top) until a full test purchase works.
3. Create the products under **Product catalog → Add product**:
   - Essentials (one-off)
   - Complete (one-off)
   - SMS credit packs
4. For each product, go to **Payment Links → New** and create a link. Claude tells you what to put in the "after payment" settings.
5. Go to **Developers → Webhooks → Add endpoint**:
   - URL `https://yourdomain.com/api/hooks/stripe`
   - Event `checkout.session.completed`
   - Copy the **Signing secret** and add it as the GitHub secret `STRIPE_WEBHOOK_SECRET`.
6. When everything works in test mode, switch to **Live mode**, repeat steps 3–5, and update the secret.

## 7. Sentry: emails you when something breaks (M6, optional)
1. Sign up at **sentry.io** on the free Developer plan.
2. Create two projects: **Browser JavaScript** (the website) and **Cloudflare Workers** (the server).
3. Copy each project's **DSN** and add the GitHub secrets `SENTRY_DSN_WEB` and `SENTRY_DSN_API`.
4. Go to **Alerts** and check that alerts go to your email.

---

## Checklist of GitHub secrets
Add these under **repo → Settings → Secrets and variables → Actions**:

| Secret | From | Step |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens | 2 |
| `CLOUDFLARE_ACCOUNT_ID` (optional: read from the token) | Cloudflare → Account Home | 2 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → Manage API tokens | 2 |
| `SESSION_SECRET` (optional: created in Cloudflare on the first deploy) | You make it up (40+ random characters) | 2 |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSCODE` | Your admin sign-in (passcode 8+ characters) | 2 |
| `MM_USER`, `MM_PASS` | Mobile Message → Settings → API | 4 |
| `MM_SIGNING_SECRET` | Mobile Message → Settings → API → webhook signing secret | 4 |
| `MM_HOOK_SECRET` | You make it up (32 random characters) | 4 |
| `RESEND_API_KEY` | Resend → API Keys | 5 |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks | 6 |
| `SENTRY_DSN_WEB`, `SENTRY_DSN_API` | Sentry → project settings | 7 |

The deploy workflow copies these into Cloudflare automatically on every deploy, so you only enter them in GitHub.

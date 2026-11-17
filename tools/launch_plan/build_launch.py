import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule

"""The Yes List launch checklist + start-up costs workbook.

Run:  python tools/launch_plan/build_launch.py
Edit the `sections` (checklist) and `items` (costs) lists below, then re-run.
Re-running KEEPS what the owner typed in the existing file: Status / Done on per task,
and Include? / Price / Billing / Currency per cost item (matched by name), plus the
exchange rate and budget. New items get their defaults; removed items disappear.
"""
import os
DEFAULT_OUT = r"C:\Users\NicholasDale\Downloads\Wedding and birthday RSVP admin\The Yes List - Launch plan and costs.xlsx"
OUT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT

# ---- carry over the owner's edits from the existing workbook ----
KEEP_TASK, KEEP_COST, KEEP = {}, {}, {}
ROWMAP = []  # (costs-sheet row, category, item, provider, default billing, note)
if os.path.exists(OUT):
    from openpyxl import load_workbook
    old = load_workbook(OUT)
    if "Launch checklist" in old.sheetnames:
        o = old["Launch checklist"]
        for row in o.iter_rows(min_row=6, values_only=True):
            if row and isinstance(row[0], int) and row[1]:
                KEEP_TASK[row[1]] = (row[5], row[6])
    if "Start-up costs" in old.sheetnames:
        o = old["Start-up costs"]
        KEEP["fx"] = o["C3"].value
        for row in o.iter_rows(min_row=6):
            a = row[0].value
            if a == "Your set-up budget (A$)":
                KEEP["budget"] = row[7].value
            if a and row[1].value and row[6].value in ("Y", "N", "y", "n"):
                # cols D..G = owner's values; hidden L..O = the script defaults they started from
                owner = tuple(c.value for c in row[3:7])
                dflt = tuple(c.value for c in row[11:15]) if len(row) >= 15 else (None,) * 4
                KEEP_COST[row[1].value] = (owner, dflt)
INK = "3B2F2F"; BLUSH = "F4E1DC"; ROSE = "B5838D"; CREAM = "FBF7F4"; GREEN = "DCEFD9"; AMBER = "FFF1CC"; BLUE = "1F4E9E"
thin = Side(style="thin", color="E3D5D0")
B = Border(left=thin, right=thin, top=thin, bottom=thin)
title_font = Font(name="Georgia", size=18, bold=True, color=INK)
sub_font = Font(name="Calibri", size=10, italic=True, color="7A6A6A")
hdr_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
hdr_fill = PatternFill("solid", fgColor=ROSE)
sec_fill = PatternFill("solid", fgColor=BLUSH)
input_font = Font(name="Calibri", size=11, color=BLUE)
wrap = Alignment(wrap_text=True, vertical="top")
AUD = '"$"#,##0.00;("$"#,##0.00);"–"'

wb = Workbook()

# ---------------- Tab 1: Launch checklist ----------------
ws = wb.active
ws.title = "Launch checklist"
ws.sheet_view.showGridLines = False
ws["A1"] = "The Yes List — Launch checklist"; ws["A1"].font = title_font
ws["A2"] = "Everything left to do before taking real couples. Work top to bottom. Set Status from the drop-down; the progress bar updates itself. Costs are in AUD and match the Start-up costs tab."
ws["A2"].font = sub_font; ws.merge_cells("A2:H2"); ws["A2"].alignment = Alignment(wrap_text=True)
ws.row_dimensions[2].height = 30
ws["A3"] = "Progress"; ws["A3"].font = Font(bold=True, color=INK)

heads = ["#", "Task", "Where / how", "Priority", "Cost (AUD)", "Status", "Done on", "Notes"]
HR = 5
for i, h in enumerate(heads, 1):
    c = ws.cell(HR, i, h); c.font = hdr_font; c.fill = hdr_fill; c.alignment = Alignment(vertical="center"); c.border = B

M, R, O = "Must do", "Recommended", "Optional"
sections = [
 ("1. Business basics", [
  ("Apply for an ABN (sole trader)", "abr.gov.au → Apply for an ABN", M, 0, "Needed for a .com.au domain, Stripe and the business name."),
  ("Register the business name \"The Yes List\"", "ASIC Connect (asic.gov.au) — check it's free first", M, 45, "$45 for 1 year or $104 for 3."),
  ("Open a business bank account", "Your bank", R, 0, "Keeps money and tax clean; Stripe pays into it."),
  ("Note GST threshold (no GST until $75k/yr sales)", "Company portal → Money & tax warns from $60k", O, 0, "Don't charge or mention GST yet."),
  ("Book a quick chat with an accountant", "Any local accountant", R, 200, "Confirm tax set-aside % (portal default 30%). Cost varies."),
 ]),
 ("2. Domain & email address", [
  ("Buy the domain", "VentraIP / Crazy Domains (.com.au needs ABN) or Cloudflare Registrar (.com)", M, 25, "About $15–25 a year."),
  ("Point the domain at Cloudflare", "Cloudflare → Add site, then change nameservers at the registrar", M, 0, ""),
  ("Add custom domain + set SITE_URL", "docs/SETUP_ACCOUNTS.md → \"Moving to your own domain\"", M, 0, "Old pages.dev links keep working. Never change SESSION_SECRET."),
  ("Add new Google/Dropbox/Microsoft redirect URIs", "Each provider's developer console", M, 0, "Only if photo storage links are switched on."),
  ("Turn on Email Routing (catch-all to the Worker)", "Cloudflare → Email → Email Routing", R, 0, "Gives every wedding its own address."),
  ("Forward hello@ to your Gmail (routing rule)", "Cloudflare → Email Routing → Routing rules: hello@ → your Gmail; keep the catch-all on the Worker", R, 0, "Free business address. No paid mailbox: Google Workspace / Microsoft 365 would take over the domain's mail and break the wedding addresses."),
  ("Reply as hello@ from Gmail (Send mail as)", "Gmail → Settings → Accounts → Send mail as: smtp.resend.com, port 465, user resend, password = your Resend key", O, 0, "Free; counts toward Resend's 3,000 a month."),
 ]),
 ("3. Payments — Stripe", [
  ("Create Stripe account (sole trader, ABN, bank)", "stripe.com", M, 0, "No monthly fee. 1.7% + 30c per AU card."),
  ("Copy secret key into Connections", "Stripe → Developers → API keys; Company portal → Settings → Connections", M, 0, "Try sk_test_ first."),
  ("Add webhook /api/hooks/stripe (checkout.session.completed)", "Stripe → Developers → Webhooks; paste signing secret in Connections", M, 0, ""),
  ("Optional: Payment Link for each plan", "Company portal → Settings → Payment links", O, 0, "For couples who ask."),
 ]),
 ("4. Email — Resend", [
  ("Sign up for Resend (free 3,000/month)", "resend.com", M, 0, "Needed for passcode resets, daily summaries, party invites."),
  ("Verify the domain (add DNS records in Cloudflare)", "Resend → Domains", M, 0, "Do after buying the domain."),
  ("Add Resend key + From address in Connections", "Company portal → Settings → Connections", M, 0, "e.g. The Yes List <hello@your-domain>."),
  ("Add a DMARC record", "Cloudflare → DNS: TXT _dmarc = v=DMARC1; p=none; rua=mailto:hello@your-domain", R, 0, "Every wedding sends from your domain: this protects its reputation so emails don't land in junk."),
 ]),
 ("5. Text messages — Mobile Message", [
  ("Create Mobile Message account + API details", "mobilemessage.com.au; paste in Connections", M, 0, ""),
  ("Top up prepaid SMS credit", "Mobile Message → Billing", M, 50, "Start $20–50; couples' 8c credits recover it."),
 ]),
 ("6. IT & safety", [
  ("Set BACKUP_PASSPHRASE for nightly encrypted backups", "GitHub → Settings → Secrets → Actions", R, 0, "Keep the passphrase somewhere safe offline."),
  ("Business Google account for the OAuth consent screen", "Create a new Google account (not your personal Gmail)", R, 0, "Keeps your personal email private."),
  ("Photo storage app keys (Google Drive, Dropbox, OneDrive)", "Company portal → Settings → Connections (Google, Dropbox, OneDrive cards)", R, 0, "Google app verification takes a few days — start early."),
  ("Add Workers AI permission to the Cloudflare API token", "Cloudflare → My Profile → API Tokens", R, 0, "Free allowance runs the planning assistant, bots and Help voice."),
  ("Upgrade to Cloudflare Workers Paid", "Cloudflare → Workers & Pages → Plans", R, 8, "US$5/mo (~A$8). Gives 30-day database time travel and room to grow."),
  ("Upgrade to Resend Pro", "resend.com → Billing", R, 31, "US$20/mo (~A$31) — more than 100 emails a day. Do it at ~3–5 weddings active at once."),
  ("Set Resend plan to Paid in Connections", "Company portal → Settings → Connections → Email → Resend plan", R, 0, "Right after upgrading: each wedding can then send 500 emails a day instead of 40."),
  ("Move sending to Amazon SES (over ~50k emails a month)", "Company portal → Settings → Connections → Email at volume (Amazon SES); docs/GROWTH_PLAN.md", O, 0, "Only when big: ~US$0.10 per 1,000 emails. Needs AWS production access first."),
  ("Subscribe to Grok / xAI for the business bots", "Only if wanted: console.x.ai (pay as you go)", O, 0, "Optional and off by default: the bots run free on Cloudflare Workers AI. Grok would be ~A$10–18/mo."),
  ("Put every account password in a password manager", "Bitwarden (free), then list the accounts in Company portal → Settings → Accounts", R, 0, "The portal never stores passwords; it tracks each account, login email, 2-step sign-in and status."),
  ("Turn on Cloudflare usage email alerts", "Cloudflare → Notifications", R, 0, "Free. Warns you before any limit; Overview → Capacity says when to upgrade."),
  ("Settings → System check shows every item ✓", "Company portal / admin", M, 0, ""),
 ]),
 ("7. Legal", [
  ("Fill business name, ABN, state, email into Privacy/Terms/Contact", "apps/web/src/sales/Legal.tsx (or ask Claude)", M, 0, ""),
  ("Have Privacy & Terms read by someone qualified", "Lawyer / LegalVision-type fixed-fee service", R, 400, "Cost varies; see Start-up costs."),
  ("Trademark \"The Yes List\" (classes 9 + 42)", "IP Australia", O, 500, "About $250 per class. Best protection for the name."),
 ]),
 ("8. Marketing accounts (free, one evening)", [
  ("Google Business Profile + Search Console (submit sitemap)", "business.google.com; search.google.com/search-console", R, 0, ""),
  ("Meta Business Suite: Facebook page + Instagram", "business.facebook.com", M, 0, "Needed for ads."),
  ("TikTok, Pinterest Business, YouTube", "Each site", O, 0, ""),
  ("Canva + CapCut for ad videos", "canva.com; capcut.com", O, 0, "Free plans are enough."),
  ("Meta ad account with a spending limit, connected to the Ads bot", "business.facebook.com → ad account (card + account spending limit) and a system user token; paste token, ad account and Page in Company portal → Settings → Connections", M, 0, "Set the account spending limit to A$280 for the test: Meta never spends past it. The Ads bot can't run until this is done."),
  ("Install Meta pixel / tracking and test a sign-up event", "docs/FACEBOOK_ADS_PLAN.md", O, 0, "Optional now: the Ads bot counts sign-ups and sales per ad from its own link. A pixel later lets Meta aim for sign-ups instead of clicks."),
  ("Run the 4-week ad test (A$10/day, cap A$280)", "Company portal → Promote → Ads (approve the drafts; the bot does the rest)", R, 280, "The bot pauses an ad after $25 with no sign-ups, stops everything at A$280, and reports daily in Overview."),
 ]),
 ("9. Final checks before announcing", [
  ("Confirm prices: Basic $50 · Essentials $88 · Deluxe $98 · extra event $39 · texts 8c", "Company portal → Money & tax / plan settings", M, 0, "LAUNCH_CHECKLIST.md still lists old prices."),
  ("Sign up as a test couple, send yourself an invite, reply by text", "Live site front page", M, 0, ""),
  ("Pay with a real card, then refund it in Stripe", "Live site + Stripe dashboard", M, 0, ""),
  ("Test Forgot passcode email end to end", "Live site sign-in", M, 0, ""),
  ("Check your own wedding and the 30th look right live", "Live site", M, 0, ""),
  ("Set support email, social links, launch code YES20 + banner", "Company portal → Settings / Promote", M, 0, ""),
  ("Confirm the 12-hourly backup ran", "GitHub → Actions → Nightly", M, 0, ""),
  ("Announce!", "Socials, friends, Google Business Profile post", M, 0, ""),
 ]),
]

r = HR + 1
n = 0
task_rows = []
for sec, items in sections:
    ws.cell(r, 1, sec).font = Font(bold=True, color=INK, size=12)
    for col in range(1, 9):
        ws.cell(r, col).fill = sec_fill; ws.cell(r, col).border = B
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    r += 1
    for task, where, pri, cost, note in items:
        n += 1
        st, done = KEEP_TASK.get(task, ("Not started", None))
        vals = [n, task, where, pri, cost, st or "Not started", done, note]
        for col, v in enumerate(vals, 1):
            c = ws.cell(r, col, v); c.alignment = wrap; c.border = B
        ws.cell(r, 5).number_format = AUD
        if cost is None:
            ws.cell(r, 5, "Varies")
        ws.cell(r, 6).font = input_font; ws.cell(r, 7).font = input_font
        ws.cell(r, 7).number_format = "d mmm yyyy"
        task_rows.append(r)
        r += 1
last = r - 1

dv = DataValidation(type="list", formula1='"Not started,In progress,Done,Skipped"', allow_blank=False)
ws.add_data_validation(dv); dv.add(f"F{HR+1}:F{last}")
ws.conditional_formatting.add(f"A{HR+1}:H{last}", FormulaRule(formula=[f'$F{HR+1}="Done"'], fill=PatternFill("solid", fgColor=GREEN)))
ws.conditional_formatting.add(f"A{HR+1}:H{last}", FormulaRule(formula=[f'$F{HR+1}="In progress"'], fill=PatternFill("solid", fgColor=AMBER)))
ws.conditional_formatting.add(f"D{HR+1}:D{last}", CellIsRule(operator="equal", formula=['"Must do"'], font=Font(bold=True, color="9C2B2B")))

rng = f"F{HR+1}:F{last}"; pr = f"D{HR+1}:D{last}"
ws["B3"] = f'=COUNTIF({rng},"Done")&" of "&(COUNTA({rng})-COUNTIF({rng},"Skipped"))&" done  ·  Must-do left: "&COUNTIFS({pr},"Must do",{rng},"<>Done",{rng},"<>Skipped")'
ws["B3"].font = Font(bold=True, color=INK)
ws["C3"] = f'=IFERROR(COUNTIF({rng},"Done")/(COUNTA({rng})-COUNTIF({rng},"Skipped")),0)'
ws["C3"].number_format = "0%"; ws["C3"].font = Font(bold=True, color=ROSE, size=14)
from openpyxl.formatting.rule import DataBarRule
ws.conditional_formatting.add("C3", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color=ROSE))

for col, w in zip("ABCDEFGH", [5, 52, 48, 14, 12, 14, 13, 46]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = f"A{HR+1}"
ws.auto_filter.ref = f"A{HR}:H{last}"
ws.print_title_rows = f"{HR}:{HR}"
ws.page_setup.orientation = "landscape"; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True

# ---------------- Tab 2: Start-up costs ----------------
cs = wb.create_sheet("Start-up costs")
cs.sheet_view.showGridLines = False
cs["A1"] = "The Yes List — Start-up & running costs"; cs["A1"].font = title_font
cs["A2"] = "Blue cells are yours to change. Set Include? to Y/N to switch an item in or out. US$ prices convert with the exchange rate below. Estimates as of Nov 2026 — check the provider's page before paying."
cs["A2"].font = sub_font; cs.merge_cells("A2:K2"); cs["A2"].alignment = Alignment(wrap_text=True); cs.row_dimensions[2].height = 30
cs["A3"] = "US$ → A$ rate"; cs["A3"].font = Font(bold=True)
cs["C3"] = KEEP.get("fx") or 1.55; cs["C3"].font = input_font; cs["C3"].number_format = "0.00"
FX = "$C$3"

ch = ["Category", "Item", "Provider", "Billing", "Currency", "Price (each)", "Include? (Y/N)", "Launch cash (A$)", "Monthly running (A$)", "Year 1 total (A$)", "Notes"]
CH = 5
for i, h in enumerate(ch, 1):
    c = cs.cell(CH, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B; c.alignment = Alignment(wrap_text=True, vertical="center")
cs.row_dimensions[CH].height = 32

# (cat, item, provider, billing, cur, price, include, note)
items = [
 ("Business setup", "ABN (sole trader)", "Australian Business Register", "One-off", "AUD", 0, "Y", "Free."),
 ("Business setup", "Business name registration", "ASIC", "Yearly", "AUD", 45, "Y", "$104 for 3 years if you prefer."),
 ("Business setup", "Business bank account", "Your bank", "Monthly", "AUD", 0, "Y", "Usually free."),
 ("Business setup", "Accountant (later, at tax time - not needed to launch)", "Local accountant", "One-off", "AUD", 200, "N", "Not needed up front. Switch to Y when you book one for your first tax return."),
 ("Business setup", "Legal review of Privacy & Terms", "Fixed-fee legal service", "One-off", "AUD", 400, "Y", "Estimate only — get a quote."),
 ("Business setup", "Trademark \"The Yes List\" (2 classes)", "IP Australia", "One-off", "AUD", 500, "Y", "About $250 per class (9 + 42). Strongest name protection."),
 ("IT & hosting", "Domain name", "VentraIP / Cloudflare Registrar", "Yearly", "AUD", 25, "Y", "About $15–25 a year."),
 ("IT & hosting", "Website hosting, database, deploys (Pages, Workers, D1)", "Cloudflare (free tier)", "Monthly", "USD", 0, "Y", "Free until Overview → Capacity says to upgrade."),
 ("IT & hosting", "Workers Paid plan (when you outgrow free)", "Cloudflare", "Monthly", "USD", 5, "Y", "Switch on only when Capacity says so. Also gives 30-day database time travel."),
 ("IT & hosting", "Email Routing (address per wedding)", "Cloudflare", "Monthly", "USD", 0, "Y", "Free."),
 ("IT & hosting", "Code, CI, nightly backups", "GitHub (private repo + Actions)", "Monthly", "USD", 0, "Y", "Free."),
 ("IT & hosting", "AI: planning assistant, bots, Help voice", "Cloudflare Workers AI", "Monthly", "USD", 0, "Y", "Free daily allowance; usage is capped to stay inside it."),
 ("IT & hosting", "Photo storage", "Couples' own Drive / Dropbox / OneDrive", "Monthly", "AUD", 0, "Y", "R2 stays off — no storage bill."),
 ("IT & hosting", "Weather for guest guides", "Open-Meteo", "Monthly", "AUD", 0, "Y", "Free."),
 ("Business tools", "Microsoft 365 Business Basic (email + Office online)", "Microsoft", "Monthly", "AUD", 11.88, "Y", "A$10.80 + GST month to month (A$9.00 + GST if you commit to a year). Your own mailbox at your domain, Teams, OneDrive 1 TB. Takes over the domain's email: set INBOX_DOMAIN to a subdomain (e.g. invites.<domain>) so wedding addresses keep working."),
 ("Business tools", "SuperGrok (Grok premium)", "xAI", "Monthly", "USD", 30, "Y", "US$30/mo on grok.com (SuperGrok Lite US$10). Separate from the Grok API for the bots, which stays off."),
 ("Business tools", "Claude Team, Standard seats (minimum 2)", "Anthropic", "Monthly", "USD", 50, "Y", "2 seats × US$25/mo month to month (US$20 a seat if paid yearly = US$40). For building and improving the site."),
 ("Subscriptions", "Transactional email (free 3,000/month)", "Resend", "Monthly", "USD", 0, "Y", "Free up to ~100 emails a day."),
 ("Subscriptions", "Resend Pro (when > 100 emails a day)", "Resend", "Monthly", "USD", 20, "Y", "Later, as weddings grow (~3–5 weddings active at once). Then set Resend plan to Paid in Connections."),
 ("Subscriptions", "Amazon SES (only above ~50k emails a month)", "Amazon Web Services", "Monthly", "USD", 5, "N", "Replaces Resend Pro at volume (~US$0.10 per 1,000 emails). Not needed to launch; see docs/GROWTH_PLAN.md."),
 ("Subscriptions", "Card payments", "Stripe", "Per sale", "AUD", 0, "Y", "No monthly fee. 1.7% + 30c per sale (~$1.80 on $88) — comes out of each sale, see box below."),
 ("Subscriptions", "SMS prepaid credit (starter)", "Mobile Message", "One-off", "AUD", 50, "Y", "Recovered from couples' 8c text credits."),
 ("Subscriptions", "Business Google account", "Google (free account)", "Monthly", "AUD", 0, "Y", "Free Gmail-style account; Google Workspace (~A$10/mo) is optional."),
 ("Subscriptions", "Grok / xAI for business bots", "xAI", "Monthly", "USD", 12, "N", "Optional, not counted — bots run free on Workers AI by default. Pay as you go, ~US$7–12/mo if switched on."),
 ("Subscriptions", "Password manager", "Bitwarden (free plan)", "Monthly", "AUD", 0, "Y", "Keeps every account's password. The portal's Settings → Accounts only lists the accounts."),
 ("Subscriptions", "Design & video tools", "Canva + CapCut (free plans)", "Monthly", "AUD", 0, "Y", "Canva Pro optional later."),
 ("Ads & marketing", "Social & listing accounts", "Meta, Google Business, TikTok, Pinterest, YouTube", "One-off", "AUD", 0, "Y", "All free."),
 ("Ads & marketing", "Meta ads test (A$10/day × 28 days)", "Meta Ads Manager", "One-off", "AUD", 280, "Y", "Hard cap A$280. Judge on purchases, not clicks."),
 ("Ads & marketing", "Engagement-season ad push (Boxing Day – 14 Feb)", "Meta Ads Manager", "One-off", "AUD", 0, "Y", "Set your own amount — only if the test pays for itself."),
 ("Ads & marketing", "Ongoing monthly ads (after the test)", "Meta / Google", "Monthly", "AUD", 0, "Y", "Set a monthly amount once you know your cost per sale."),
]

r = CH + 1
first = r
for cat, item, prov, bill, cur, price, inc, note in items:
    new_dflt = (bill, cur, price, inc)
    if item in KEEP_COST:
        owner, old_dflt = KEEP_COST[item]
        # keep a field only where the owner changed it from the default it started as;
        # otherwise take the (possibly updated) script default
        merged = []
        for i in range(4):
            edited = old_dflt[i] is not None and owner[i] != old_dflt[i]
            if old_dflt[i] is None:  # first-generation file: no defaults stored, keep Include? only
                edited = i == 3 and owner[i] is not None
            merged.append(owner[i] if edited else new_dflt[i])
        bill, cur, price, inc = merged
    ROWMAP.append((r, cat, item, prov, new_dflt[0], note))
    vals = [cat, item, prov, bill, cur, price, inc]
    for k, v in enumerate(new_dflt):
        cs.cell(r, 12 + k, v)
    for col, v in enumerate(vals, 1):
        c = cs.cell(r, col, v); c.border = B; c.alignment = wrap
    for col in (4, 5, 6, 7):
        cs.cell(r, col).font = input_font
    cs.cell(r, 6).number_format = '#,##0.00'
    aud = f'F{r}*IF(E{r}="USD",{FX},1)*IF(UPPER(G{r})="Y",1,0)'
    cs.cell(r, 8, f'=IF(OR(D{r}="One-off",D{r}="Yearly"),{aud},IF(D{r}="Monthly",{aud},0))')
    cs.cell(r, 9, f'=IF(D{r}="Monthly",{aud},IF(D{r}="Yearly",{aud}/12,0))')
    cs.cell(r, 10, f'=IF(OR(D{r}="One-off",D{r}="Yearly"),{aud},IF(D{r}="Monthly",{aud}*12,0))')
    for col in (8, 9, 10):
        c = cs.cell(r, col); c.number_format = AUD; c.border = B
    c = cs.cell(r, 11, note); c.border = B; c.alignment = wrap
    r += 1
lastc = r - 1

dv2 = DataValidation(type="list", formula1='"Y,N"'); cs.add_data_validation(dv2); dv2.add(f"G{first}:G{lastc}")
dv3 = DataValidation(type="list", formula1='"One-off,Monthly,Yearly,Per sale"'); cs.add_data_validation(dv3); dv3.add(f"D{first}:D{lastc}")
dv4 = DataValidation(type="list", formula1='"AUD,USD"'); cs.add_data_validation(dv4); dv4.add(f"E{first}:E{lastc}")
cs.conditional_formatting.add(f"A{first}:K{lastc}", FormulaRule(formula=[f'UPPER($G{first})="N"'], font=Font(color="A0A0A0", italic=True)))
cs.conditional_formatting.add(f"A{first}:K{lastc}", FormulaRule(formula=[f'MOD(ROW(),2)=0'], fill=PatternFill("solid", fgColor=CREAM)))

# Totals row
r = lastc + 1
cs.cell(r, 1, "TOTAL (included items)").font = Font(bold=True, color="FFFFFF")
for col in range(1, 12):
    cs.cell(r, col).fill = PatternFill("solid", fgColor=INK); cs.cell(r, col).border = B
for col, L in ((8, "H"), (9, "I"), (10, "J")):
    c = cs.cell(r, col, f"=SUM({L}{first}:{L}{lastc})"); c.number_format = AUD; c.font = Font(bold=True, color="FFFFFF")
tot = r

# Summary by category
r += 2
cs.cell(r, 1, "Summary by category").font = Font(name="Georgia", size=13, bold=True, color=INK)
r += 1
for i, h in enumerate(["Category", "", "", "", "", "", "", "Launch cash (A$)", "Monthly running (A$)", "Year 1 total (A$)"], 1):
    if h:
        c = cs.cell(r, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B
r += 1
for cat in ["Business setup", "IT & hosting", "Business tools", "Subscriptions", "Ads & marketing"]:
    cs.cell(r, 1, cat).border = B
    for col, L in ((8, "H"), (9, "I"), (10, "J")):
        c = cs.cell(r, col, f'=SUMIF($A${first}:$A${lastc},$A{r},{L}${first}:{L}${lastc})'); c.number_format = AUD; c.border = B
    r += 1

# Budget check
r += 1
cs.cell(r, 1, "Budget check").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
cs.cell(r, 1, "Your set-up budget (A$)"); cs.cell(r, 8, KEEP.get("budget") or 150).font = input_font; cs.cell(r, 8).number_format = AUD; bud = r; r += 1
cs.cell(r, 1, "Launch cash needed"); cs.cell(r, 8, f"=H{tot}").number_format = AUD; r += 1
cs.cell(r, 1, "  of which ads"); cs.cell(r, 8, f'=SUMIF($A${first}:$A${lastc},"Ads & marketing",H${first}:H${lastc})').number_format = AUD; ads = r; r += 1
cs.cell(r, 1, "Left over (or short) — including ads"); c = cs.cell(r, 8, f"=H{bud}-H{tot}"); c.number_format = AUD; c.font = Font(bold=True); r += 1
cs.cell(r, 1, "Left over (or short) — excluding ads"); c = cs.cell(r, 8, f"=H{bud}-(H{tot}-H{ads})"); c.number_format = AUD; c.font = Font(bold=True); r += 1
cs.conditional_formatting.add(f"H{r-2}:H{r-1}", CellIsRule(operator="lessThan", formula=["0"], font=Font(bold=True, color="C00000")))

# Per-sale fees box
r += 1
cs.cell(r, 1, "What each sale costs you (comes out of the sale, not up front)").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
for i, h in enumerate(["Plan", "", "", "", "", "Price (A$)", "", "Stripe fee (A$)", "You keep (A$)"], 1):
    if h:
        c = cs.cell(r, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B
r += 1
for plan, price in (("Basic", 50), ("Essentials", 88), ("Deluxe", 98), ("Extra event add-on", 39)):
    cs.cell(r, 1, plan).border = B
    c = cs.cell(r, 6, price); c.font = input_font; c.number_format = AUD; c.border = B
    c = cs.cell(r, 8, f"=ROUND(F{r}*0.017+0.3,2)"); c.number_format = AUD; c.border = B
    c = cs.cell(r, 9, f"=F{r}-H{r}"); c.number_format = AUD; c.border = B
    r += 1
cs.cell(r, 1, "Stripe: 1.7% + 30c per Australian card. Texts sell at 8c a credit (about 3c margin each).").font = sub_font

for col, w in zip("ABCDEFGHIJK", [17, 42, 30, 11, 9, 11, 10, 15, 16, 15, 52]):
    cs.column_dimensions[col].width = w
for col in "LMNO":  # script defaults, used to keep the owner's edits on rebuild
    cs.column_dimensions[col].hidden = True
cs.freeze_panes = f"C{CH+1}"
cs.page_setup.orientation = "landscape"; cs.sheet_properties.pageSetUpPr.fitToPage = True
cs.page_setup.fitToWidth = 1; cs.page_setup.fitToHeight = 0

# ---------------- Tab 3: Monthly payments ----------------
import datetime as dt
mp = wb.create_sheet("Monthly payments")
mp.sheet_view.showGridLines = False
mp["A1"] = "The Yes List — Monthly ongoing payments"; mp["A1"].font = title_font
mp["A2"] = ("What leaves your account each month after launch. Fixed bills come straight from the Start-up costs tab "
            "(change Include?/price there). Usage costs below depend on how many weddings you sell — change the blue cells.")
mp["A2"].font = sub_font; mp.merge_cells("A2:H2"); mp["A2"].alignment = Alignment(wrap_text=True); mp.row_dimensions[2].height = 30
CSN = "'Start-up costs'!"
KEEPM = {}
if os.path.exists(OUT):
    try:
        from openpyxl import load_workbook as _lw
        _o = _lw(OUT)
        if "Monthly payments" in _o.sheetnames:
            for row in _o["Monthly payments"].iter_rows(values_only=True):
                if row and row[0] in ("Weddings sold per month", "Average sale (A$)", "Ads per month (A$)", "First month of payments"):
                    KEEPM[row[0]] = row[2]
    except Exception:
        pass

# Fixed bills
r = 4
mp.cell(r, 1, "1. Fixed bills").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
for i, h in enumerate(["Item", "Provider", "How it's charged", "Included?", "Per month (A$)", "Per year (A$)", "Notes"], 1):
    c = mp.cell(r, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B
r += 1
f1 = r
for (cr, cat, item, prov, dbill, note) in ROWMAP:
    if dbill not in ("Monthly", "Yearly"):
        continue
    mp.cell(r, 1, f"={CSN}B{cr}"); mp.cell(r, 2, f"={CSN}C{cr}")
    mp.cell(r, 3, f'=IF({CSN}D{cr}="Yearly","Once a year (shown as 1/12)",{CSN}D{cr})')
    mp.cell(r, 4, f"=UPPER({CSN}G{cr})")
    mp.cell(r, 5, f"={CSN}I{cr}"); mp.cell(r, 6, f"={CSN}I{cr}*12")
    mp.cell(r, 7, f"={CSN}K{cr}")
    for col in range(1, 8):
        mp.cell(r, col).border = B; mp.cell(r, col).alignment = wrap
    mp.cell(r, 5).number_format = AUD; mp.cell(r, 6).number_format = AUD
    r += 1
l1 = r - 1
mp.conditional_formatting.add(f"A{f1}:G{l1}", FormulaRule(formula=[f'$D{f1}="N"'], font=Font(color="A0A0A0", italic=True)))
mp.cell(r, 1, "Fixed bills total").font = Font(bold=True)
c = mp.cell(r, 5, f"=SUM(E{f1}:E{l1})"); c.number_format = AUD; c.font = Font(bold=True)
c = mp.cell(r, 6, f"=SUM(F{f1}:F{l1})"); c.number_format = AUD; c.font = Font(bold=True)
fixed = r; r += 2

# Usage costs
mp.cell(r, 1, "2. Usage costs (grow with sales)").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
def inp(label, val, fmt, note=""):
    global r
    mp.cell(r, 1, label); c = mp.cell(r, 3, KEEPM.get(label, val)); c.font = input_font; c.number_format = fmt
    mp.cell(r, 7, note).font = sub_font
    r += 1
    return r - 1
sold = inp("Weddings sold per month", 10, "0", "Your estimate.")
avg = inp("Average sale (A$)", 88, AUD, "Essentials $88 · Deluxe $98 · Basic $50.")
adsm = inp("Ads per month (A$)", 0, AUD, "After the 4-week test, only if it pays for itself.")
r += 1
for i, h in enumerate(["Item", "Provider", "How it's charged", "", "Per month (A$)", "Per year (A$)", "Notes"], 1):
    if h:
        c = mp.cell(r, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B
r += 1
f2 = r
usage = [
    ("Card fees", "Stripe", "1.7% + 30c per sale", f"=C{sold}*ROUND(C{avg}*0.017+0.3,2)", "Taken out of each sale before it reaches your bank."),
    ("Text message top-ups", "Mobile Message", "Prepaid, ~2c a text", "=0", "Couples buy 8c credits, so top-ups are paid back (≈3c profit a credit)."),
    ("Ads", "Meta / Google", "Your monthly budget", f"=C{adsm}", ""),
]
for item, prov, how, f, note in usage:
    for col, v in enumerate([item, prov, how, None, f, None, note], 1):
        c = mp.cell(r, col, v); c.border = B; c.alignment = wrap
    mp.cell(r, 6, f"=E{r}*12")
    mp.cell(r, 5).number_format = AUD; mp.cell(r, 6).number_format = AUD
    r += 1
l2 = r - 1
mp.cell(r, 1, "Usage costs total").font = Font(bold=True)
c = mp.cell(r, 5, f"=SUM(E{f2}:E{l2})"); c.number_format = AUD; c.font = Font(bold=True)
c = mp.cell(r, 6, f"=SUM(F{f2}:F{l2})"); c.number_format = AUD; c.font = Font(bold=True)
use = r; r += 2

# Bottom line
mp.cell(r, 1, "3. Bottom line each month").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
lines = [
    ("Money in (sales)", f"=C{sold}*C{avg}"),
    ("Monthly payments out (fixed + usage)", f"=E{fixed}+E{use}"),
    ("Left before tax", f"=E{r}-E{r+1}"),
    ("Set aside for tax (30%)", f"=MAX(0,E{r+2}*0.3)"),
    ("Yours to keep", f"=E{r+2}-E{r+3}"),
]
for i, (lab, f) in enumerate(lines):
    mp.cell(r, 1, lab).font = Font(bold=(i in (1, 4)))
    c = mp.cell(r, 5, f); c.number_format = AUD; c.font = Font(bold=(i in (1, 4)))
    r += 1
mp.conditional_formatting.add(f"E{r-3}:E{r-1}", CellIsRule(operator="lessThan", formula=["0"], font=Font(bold=True, color="C00000")))
mp.cell(r, 1, "General figures only — not tax advice.").font = sub_font
r += 2

# 12-month calendar of payments
mp.cell(r, 1, "4. Next 12 months — cash out by month").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
mp.cell(r, 1, "First month of payments"); c = mp.cell(r, 3, KEEPM.get("First month of payments") or dt.date(2026, 12, 1))
c.font = input_font; c.number_format = "mmm yyyy"; start = r; r += 1
mp.cell(r, 1, "Yearly bills (domain, business name) are shown in the first month; monthly bills every month.").font = sub_font; r += 1
hdr = r
c = mp.cell(r, 1, "Month"); c.font = hdr_font; c.fill = hdr_fill
for k, h in enumerate(["Monthly bills", "Yearly bills", "Usage costs", "Total out"], 2):
    c = mp.cell(r, k, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B
r += 1
yearly_sum = "+".join(f'IF(AND({CSN}D{cr}="Yearly",UPPER({CSN}G{cr})="Y"),{CSN}F{cr}*IF({CSN}E{cr}="USD",{CSN}$C$3,1),0)'
                      for (cr, *_rest) in ROWMAP) or "0"
monthly_sum = "+".join(f'IF(AND({CSN}D{cr}="Monthly",UPPER({CSN}G{cr})="Y"),{CSN}F{cr}*IF({CSN}E{cr}="USD",{CSN}$C$3,1),0)'
                       for (cr, *_rest) in ROWMAP) or "0"
mf = r
for m in range(12):
    c = mp.cell(r, 1, f"=EDATE($C${start},{m})"); c.number_format = "mmm yyyy"; c.border = B
    c = mp.cell(r, 2, f"={monthly_sum}" if m == 0 else f"=B{mf}"); c.number_format = AUD; c.border = B
    c = mp.cell(r, 3, f"={yearly_sum}" if m == 0 else "=0"); c.number_format = AUD; c.border = B
    c = mp.cell(r, 4, f"=E{use}"); c.number_format = AUD; c.border = B
    c = mp.cell(r, 5, f"=SUM(B{r}:D{r})"); c.number_format = AUD; c.border = B; c.font = Font(bold=True)
    r += 1
mp.cell(r, 1, "12-month total").font = Font(bold=True)
for k in range(2, 6):
    L = "ABCDE"[k - 1]
    c = mp.cell(r, k, f"=SUM({L}{mf}:{L}{r-1})"); c.number_format = AUD; c.font = Font(bold=True)
    c.fill = PatternFill("solid", fgColor=BLUSH)

for col, w in zip("ABCDEFG", [40, 26, 26, 16, 16, 15, 56]):
    mp.column_dimensions[col].width = w
mp.page_setup.orientation = "landscape"; mp.sheet_properties.pageSetUpPr.fitToPage = True
mp.page_setup.fitToWidth = 1; mp.page_setup.fitToHeight = 0

# ---------------- Tab: Upfront costs (the owner's tool list) ----------------
ROW_OF = {item: cr for (cr, cat, item, *_r) in ROWMAP}
CSN = "'Start-up costs'!"
up = wb.create_sheet("Upfront costs")
up.sheet_view.showGridLines = False
up["A1"] = "The Yes List — Upfront costs for your tools"; up["A1"].font = title_font
up["A2"] = ("What you pay on day one for each tool, then every month. Prices and Include? come from the Start-up costs tab "
            "(change them there). US$ prices use the exchange rate on that tab and are before any 10% GST the provider adds "
            "at checkout. Estimates as of Nov 2026 — check each provider's page before paying.")
up["A2"].font = sub_font; up.merge_cells("A2:H2"); up["A2"].alignment = Alignment(wrap_text=True); up.row_dimensions[2].height = 44
heads = ["#", "Tool", "Plan", "Billing", "Included?", "Pay up front (A$)", "Then per month (A$)", "First year (A$)", "Notes"]
UH = 4
for i, h in enumerate(heads, 1):
    c = up.cell(UH, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B; c.alignment = Alignment(wrap_text=True, vertical="center")
up.row_dimensions[UH].height = 32
tools = [
    ("Microsoft account and email", "Microsoft 365 Business Basic (email + Office online)"),
    ("Domain + web address (URL)", "Domain name"),
    ("Grok premium", "SuperGrok (Grok premium)"),
    ("Claude Team (Standard)", "Claude Team, Standard seats (minimum 2)"),
    ("GitHub", "Code, CI, nightly backups"),
    ("Cloudflare — hosting, database, email routing", "Website hosting, database, deploys (Pages, Workers, D1)"),
    ("Cloudflare — Workers Paid (when Capacity says so)", "Workers Paid plan (when you outgrow free)"),
]
extra_note = {
    "Domain name": "e.g. a .com.au at VentraIP (~A$20/yr, needs your ABN). Connecting it to the site is free in Cloudflare.",
    "Code, CI, nightly backups": "GitHub Free: the repo, the builds and the nightly backups. GitHub Team (US$4 a person a month) only if you add staff.",
}
r = UH + 1; uf = r
for n, (label, item) in enumerate(tools, 1):
    cr = ROW_OF[item]
    vals = [n, label, f"={CSN}C{cr}&\" — \"&{CSN}B{cr}", f"={CSN}D{cr}", f"=UPPER({CSN}G{cr})",
            f"={CSN}H{cr}", f"={CSN}I{cr}", f"={CSN}J{cr}", extra_note.get(item) or f"={CSN}K{cr}"]
    for col, v in enumerate(vals, 1):
        c = up.cell(r, col, v); c.border = B; c.alignment = wrap
    for col in (6, 7, 8):
        up.cell(r, col).number_format = AUD
    r += 1
ul = r - 1
up.conditional_formatting.add(f"A{uf}:I{ul}", FormulaRule(formula=[f'$E{uf}="N"'], font=Font(color="A0A0A0", italic=True)))
up.conditional_formatting.add(f"A{uf}:I{ul}", FormulaRule(formula=['MOD(ROW(),2)=0'], fill=PatternFill("solid", fgColor=CREAM)))
up.cell(r, 2, "TOTAL — your tools").font = Font(bold=True, color="FFFFFF")
for col in range(1, 10):
    up.cell(r, col).fill = PatternFill("solid", fgColor=INK); up.cell(r, col).border = B
for col, L in ((6, "F"), (7, "G"), (8, "H")):
    c = up.cell(r, col, f"=SUM({L}{uf}:{L}{ul})"); c.number_format = AUD; c.font = Font(bold=True, color="FFFFFF")
utot = r; r += 2
up.cell(r, 2, "Cheaper ways to run the same tools").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
for tip in [
    "Claude Team paid yearly: US$20 a seat instead of US$25 (saves ~A$185 a year on 2 seats). Claude Pro for one person is cheaper again if you don't need a team.",
    "Microsoft 365 on a 12-month commitment: A$9.00 + GST instead of A$10.80 + GST. Or skip it: the free hello@ forward to Gmail still works.",
    "SuperGrok Lite is US$10 a month if you only chat with Grok now and then.",
    "Cloudflare and GitHub stay free until Overview → Capacity says to upgrade.",
]:
    up.cell(r, 2, "• " + tip).alignment = Alignment(wrap_text=True, vertical="top"); up.merge_cells(start_row=r, start_column=2, end_row=r, end_column=9)
    up.row_dimensions[r].height = 30; r += 1
for col, w in zip("ABCDEFGHI", [4, 40, 48, 10, 10, 15, 15, 15, 60]):
    up.column_dimensions[col].width = w
up.freeze_panes = f"C{UH+1}"
up.page_setup.orientation = "landscape"; up.sheet_properties.pageSetUpPr.fitToPage = True
up.page_setup.fitToWidth = 1; up.page_setup.fitToHeight = 0

# ---------------- Tab: Future expansion ----------------
KEEPX = {}
if os.path.exists(OUT):
    try:
        from openpyxl import load_workbook as _lw2
        _o = _lw2(OUT)
        if "Future expansion" in _o.sheetnames:
            for row in _o["Future expansion"].iter_rows(min_row=6, values_only=True):
                if row and row[1] and row[6] in ("Y", "N", "y", "n"):
                    KEEPX[row[1]] = (row[4], row[5], row[6])
                if row and row[0] == "Average sale (A$)":
                    KEEPX["_avg"] = row[2]
    except Exception:
        pass
fx = wb.create_sheet("Future expansion")
fx.sheet_view.showGridLines = False
fx["A1"] = "The Yes List — Costs as you grow"; fx["A1"].font = title_font
fx["A2"] = ("Extra monthly costs that switch on as the business grows, on top of the Upfront costs tab. Each stage lists what to add "
            "and roughly when. Blue cells are yours: change a price or set Include? to N. Rough guides only — check prices when you get there.")
fx["A2"].font = sub_font; fx.merge_cells("A2:J2"); fx["A2"].alignment = Alignment(wrap_text=True); fx.row_dimensions[2].height = 32
fx["A3"] = "Average sale (A$)"; fx["A3"].font = Font(bold=True)
fx["C3"] = KEEPX.get("_avg") or 88; fx["C3"].font = input_font; fx["C3"].number_format = AUD
fx["D3"] = "Used to work out how many weddings a month pay for each stage (after Stripe's fee)."; fx["D3"].font = sub_font
fh = ["Stage", "Service", "What it's for", "When to add it", "Currency", "Price a month", "Include? (Y/N)", "Per month (A$)", "Per year (A$)", "Notes"]
XH = 5
for i, h in enumerate(fh, 1):
    c = fx.cell(XH, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B; c.alignment = Alignment(wrap_text=True, vertical="center")
fx.row_dimensions[XH].height = 32
S1, S2, S3, S4 = ("1. Launch", "2. Growing", "3. Busy", "4. Big")
grow = [
 (S2, "Cloudflare Workers Paid", "More requests, 30-day database undo", "~5 weddings live at once, or when Capacity says", "USD", 5, "N", "Already counted on the Upfront costs tab, so N here."),
 (S2, "Resend Pro email", "50,000 emails a month", "~3–5 weddings sending invites at once (over 100 emails a day)", "USD", 20, "Y", "Then set Resend plan to Paid in Connections."),
 (S2, "Business insurance (public liability + professional indemnity)", "Cover if a client claims against you", "Before your first paying couples", "AUD", 70, "Y", "Rough guide ~A$600–1,000 a year for an online sole trader. Get a quote."),
 (S2, "Bookkeeping software", "Track sales and costs for tax", "From your first sales", "AUD", 35, "Y", "e.g. Xero / MYOB starter plans. A free spreadsheet works at the start."),
 (S2, "Accountant (first tax return, spread over the year)", "Tax return and set-aside check", "Once a year", "AUD", 25, "Y", "~A$300 a year shown monthly."),
 (S3, "Extra Microsoft 365 mailbox", "An email for a helper", "When someone helps with support", "AUD", 11.88, "Y", "A$10.80 + GST per extra person."),
 (S3, "Extra Claude Team seat", "A helper or developer working on the site", "When a second person builds with you", "USD", 25, "N", "The 2-seat minimum already covers one helper."),
 (S3, "Grok API for the business bots", "Stronger AI for ads, help and planning bots", "If the free Cloudflare AI answers feel weak", "USD", 12, "Y", "Pay as you go, ~US$7–12 a month."),
 (S3, "Cloudflare usage above the Workers Paid allowance", "More traffic and database reads", "~50+ weddings live at once", "USD", 10, "Y", "Pay per use; Overview → Capacity shows it."),
 (S3, "Canva Pro", "Brand kit, more templates for ads", "When you post ads every week", "AUD", 20, "Y", "Free plan is enough to start."),
 (S3, "Ongoing ads", "Steady new couples", "After the 4-week test pays for itself", "AUD", 300, "Y", "Set your own amount once you know cost per sale."),
 (S4, "Amazon SES instead of Resend Pro", "Cheaper email at volume", "Over ~50,000 emails a month", "USD", 10, "N", "~US$0.10 per 1,000 emails. Turn Resend Pro off when this goes on."),
 (S4, "Photo storage on our own servers (Cloudflare R2)", "Hold guest photos for couples without Drive", "Only if you choose to host photos", "USD", 15, "N", "~US$0.015 per GB a month; 1 TB ≈ US$15."),
 (S4, "Microsoft 365 Business Standard upgrade", "Desktop Word/Excel/Outlook", "If you want the desktop apps", "AUD", 9, "N", "~A$8–9 more per person than Basic."),
 (S4, "Part-time support helper (5 hours a week)", "Answer couples' questions in busy season", "Engagement season (Boxing Day – Feb) or 100+ weddings live", "AUD", 800, "N", "Casual wage + super. Only when the sales cover it."),
 (S4, "GST registration", "Required once sales pass A$75,000 a year", "Within 21 days of reaching A$75k", "AUD", 0, "Y", "Not a bill as such: 1/11 of each sale goes to the ATO. Tick GST in Company portal → Money & tax."),
]
r = XH + 1; xf = r
base_row = r
# Stage 1 = the upfront tools, pulled from the Upfront tab
for col, v in enumerate([S1, "Your tools (from Upfront costs tab)", "Microsoft 365, domain, SuperGrok, Claude Team, GitHub, Cloudflare", "Now", "AUD", f"='Upfront costs'!G{utot}", "Y", f"='Upfront costs'!G{utot}", f"='Upfront costs'!G{utot}*12", "Change these on the Start-up costs tab."], 1):
    c = fx.cell(r, col, v); c.border = B; c.alignment = wrap
for col in (6, 8, 9):
    fx.cell(r, col).number_format = AUD
r += 1
for row in grow:
    stage, svc, what, when, cur, price, inc, note = row[:8]
    if svc in KEEPX:
        cur, price, inc = (KEEPX[svc][0] or cur), (KEEPX[svc][1] if KEEPX[svc][1] is not None else price), (KEEPX[svc][2] or inc)
    for col, v in enumerate([stage, svc, what, when, cur, price, inc], 1):
        c = fx.cell(r, col, v); c.border = B; c.alignment = wrap
    for col in (5, 6, 7):
        fx.cell(r, col).font = input_font
    fx.cell(r, 6).number_format = '#,##0.00'
    aud = f'F{r}*IF(E{r}="USD",{CSN}$C$3,1)*IF(UPPER(G{r})="Y",1,0)'
    c = fx.cell(r, 8, f"={aud}"); c.number_format = AUD; c.border = B
    c = fx.cell(r, 9, f"={aud}*12"); c.number_format = AUD; c.border = B
    c = fx.cell(r, 10, note); c.border = B; c.alignment = wrap
    r += 1
xl = r - 1
dvx = DataValidation(type="list", formula1='"Y,N"'); fx.add_data_validation(dvx); dvx.add(f"G{xf+1}:G{xl}")
dvc = DataValidation(type="list", formula1='"AUD,USD"'); fx.add_data_validation(dvc); dvc.add(f"E{xf+1}:E{xl}")
fx.conditional_formatting.add(f"A{xf}:J{xl}", FormulaRule(formula=[f'UPPER($G{xf})="N"'], font=Font(color="A0A0A0", italic=True)))
for stage, colr in ((S1, "FBF7F4"), (S2, "F4E1DC"), (S3, "EADCF0"), (S4, "DCE8F4")):
    fx.conditional_formatting.add(f"A{xf}:A{xl}", CellIsRule(operator="equal", formula=[f'"{stage}"'], fill=PatternFill("solid", fgColor=colr), font=Font(bold=True)))

# Stage summary
r += 1
fx.cell(r, 1, "What each stage costs").font = Font(name="Georgia", size=13, bold=True, color=INK); r += 1
for i, h in enumerate(["Stage", "Roughly when", "", "", "", "", "", "Added a month (A$)", "Running total a month (A$)", "Weddings a month to cover it"], 1):
    if h:
        c = fx.cell(r, i, h); c.font = hdr_font; c.fill = hdr_fill; c.border = B; c.alignment = Alignment(wrap_text=True)
r += 1; sf = r
whens = {S1: "Launch — 0 to ~5 weddings live", S2: "First paying couples — ~5 to 20 live", S3: "~20 to 100 weddings live", S4: "100+ live / over A$75k a year"}
for stage in (S1, S2, S3, S4):
    fx.cell(r, 1, stage).border = B; fx.cell(r, 2, whens[stage]).border = B
    c = fx.cell(r, 8, f'=SUMIF($A${xf}:$A${xl},A{r},$H${xf}:$H${xl})'); c.number_format = AUD; c.border = B
    c = fx.cell(r, 9, f"=SUM($H${sf}:H{r})"); c.number_format = AUD; c.border = B; c.font = Font(bold=True)
    c = fx.cell(r, 10, f"=IFERROR(ROUNDUP(I{r}/($C$3-ROUND($C$3*0.017+0.3,2)),0),0)"); c.number_format = "0"; c.border = B; c.font = Font(bold=True)
    r += 1
fx.cell(r, 1, "Weddings a month to cover it = running total ÷ what you keep from an average sale after Stripe's fee (before tax). General figures only — not financial advice.").font = sub_font

for col, w in zip("ABCDEFGHIJ", [12, 40, 36, 36, 9, 11, 10, 15, 16, 58]):
    fx.column_dimensions[col].width = w
fx.freeze_panes = f"C{XH+1}"
fx.page_setup.orientation = "landscape"; fx.sheet_properties.pageSetUpPr.fitToPage = True
fx.page_setup.fitToWidth = 1; fx.page_setup.fitToHeight = 0

# Put the two new tabs right after the checklist
order = ["Launch checklist", "Upfront costs", "Future expansion", "Start-up costs", "Monthly payments"]
wb._sheets.sort(key=lambda s: order.index(s.title) if s.title in order else 99)

wb.save(OUT)
print("saved", OUT)

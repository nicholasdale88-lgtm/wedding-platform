#!/usr/bin/env bash
# Deploys the STAGING copy of the site (docs/STAGING.md). Run by CI on the `staging` branch after every check has passed.
# Everything here is separate from the live site, so nothing staging does can touch live data:
#   Worker  wedding-api-staging       (live: wedding-api)
#   D1      wedding-db-staging        (live: wedding-db)
#   R2      media-staging             (live: media)
#   Pages   <project>-staging         (live: <project>), whose /api/* goes to wedding-api-staging only
# No texts and no emails ever leave staging: no cron trigger, and the SMS, email, payment and sign-in-provider
# keys are never given to the staging Worker. Pages carry a "STAGING" banner and are never indexed.
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?Add the CLOUDFLARE_API_TOKEN secret (docs/SETUP_ACCOUNTS.md)}"

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts | jq -r '.result[0].id // empty')
  : "${CLOUDFLARE_ACCOUNT_ID:?Could not read the account from the token. Add a CLOUDFLARE_ACCOUNT_ID secret.}"
fi
export CLOUDFLARE_ACCOUNT_ID

ROOT=$(pwd)
PROJECT="${PAGES_PROJECT:-wedding-platform-nd}-staging"
WORKER=wedding-api-staging
DB=wedding-db-staging
BUCKET=media-staging
API="$ROOT/apps/api"
WEB="$ROOT/apps/web"
TMP="${RUNNER_TEMP:-/tmp}"

wr() { (cd "$API" && pnpm exec wrangler "$@"); }
cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID$1" "${@:2}"; }
json_post() { cf "$1" -X POST -H 'content-type: application/json' --data "$2"; }

echo "::group::0. Point the config at the staging copies"
# CI's checkout is thrown away after the run, so the config is rewritten in place (nothing is committed).
sed -i \
  -e "s/^name = \"wedding-api\"/name = \"$WORKER\"/" \
  -e "s/^database_name = \"wedding-db\"/database_name = \"$DB\"/" \
  -e "s/^bucket_name = \"media\"/bucket_name = \"$BUCKET\"/" \
  -e 's/^crons = .*/crons = [] # staging never sends scheduled texts/' \
  "$API/wrangler.toml"
# Stop here rather than deploy anything if a live name survived the rewrite.
if grep -qE '^(name = "wedding-api"|database_name = "wedding-db"|bucket_name = "media")$' "$API/wrangler.toml" || grep -qE '^crons = \[ *"' "$API/wrangler.toml"; then
  echo "::error::apps/api/wrangler.toml still names a live resource; staging deploy stopped."
  cat "$API/wrangler.toml"
  exit 1
fi
grep -q "^name = \"$WORKER\"" "$API/wrangler.toml" && grep -q "^database_name = \"$DB\"" "$API/wrangler.toml" || { echo "::error::Could not point wrangler.toml at staging"; exit 1; }
sed -i -e "s/PAGES_PROJECT/$PROJECT/" -e "s/^service = \"wedding-api\"/service = \"$WORKER\"/" "$WEB/wrangler.toml"
grep -q "^service = \"$WORKER\"" "$WEB/wrangler.toml" || { echo "::error::Could not point the website at the staging Worker"; exit 1; }
echo "::endgroup::"

echo "::group::1. Database"
DB_ID=$(cf "/d1/database?name=$DB" | jq -r --arg n "$DB" '.result[] | select(.name == $n) | .uuid' | head -n1)
if [ -z "$DB_ID" ]; then
  DB_ID=$(json_post /d1/database "{\"name\":\"$DB\"}" | jq -r '.result.uuid')
  echo "Created $DB ($DB_ID)"
fi
sed -i "s/00000000-0000-0000-0000-000000000000/$DB_ID/" "$API/wrangler.toml"
wr d1 migrations apply "$DB" --remote
echo "::endgroup::"

echo "::group::2. Upload storage"
if cf "/r2/buckets/$BUCKET" >/dev/null 2>&1 || json_post /r2/buckets "{\"name\":\"$BUCKET\"}" >/dev/null 2>&1; then
  echo "R2 bucket '$BUCKET' ready"
else
  echo "::warning::R2 isn't enabled on this account; uploads are off on staging."
  perl -0pi -e "s/\[\[r2_buckets\]\]\nbinding = \"MEDIA\"\nbucket_name = \"$BUCKET\"\n//" "$API/wrangler.toml"
fi
if cf "/ai/models/search?per_page=1" >/dev/null 2>&1; then
  printf '\n[ai]\nbinding = "AI"\n' >> "$API/wrangler.toml"
fi
echo "::endgroup::"

echo "::group::3. Seed"
WEDDINGS=$(wr d1 execute "$DB" --remote --json --command "SELECT COUNT(*) AS n FROM wedding" | jq -r '.[0].results[0].n')
if [ "$WEDDINGS" = "0" ]; then
  : "${SEED_OWNER_EMAIL:?Add the SEED_OWNER_EMAIL secret}" "${SEED_OWNER_PASSCODE:?Add the SEED_OWNER_PASSCODE secret}"
  # Sample guests are kept on staging (made-up people to test with; staging can't text or email anyone).
  (cd "$API" && pnpm seed:sql "$ROOT/seed/sophie-nicholas.json" "$TMP/seed.sql")
  wr d1 execute "$DB" --remote --file "$TMP/seed.sql"
  rm -f "$TMP/seed.sql"
else
  echo "Already seeded ($WEDDINGS wedding(s)); leaving staging data alone."
fi
# Same one-time fixes and content sync as live, so they are tried here first.
for f in "$ROOT"/scripts/once/*.sql; do wr d1 execute "$DB" --remote --file "$f"; done
wr d1 execute "$DB" --remote --json --command "SELECT content, guide FROM wedding WHERE slug = 'sophie-and-nicholas'" > "$TMP/content.json"
(cd "$API" && pnpm exec tsx scripts/content-sync.ts "$TMP/content.json" "$ROOT/seed/sophie-nicholas.json" sophie-and-nicholas "$TMP/content.sql")
if [ -s "$TMP/content.sql" ]; then wr d1 execute "$DB" --remote --file "$TMP/content.sql"; fi
rm -f "$TMP/content.json" "$TMP/content.sql"
if [ -n "${SEED_OWNER_EMAIL:-}${SEED_OWNER_PASSCODE:-}" ]; then
  wr d1 execute "$DB" --remote --json --command "SELECT u.id, u.email, u.pass_hash FROM user u JOIN membership m ON m.user_id = u.id JOIN wedding w ON w.id = m.wedding_id WHERE w.slug = 'sophie-and-nicholas' AND m.role = 'owner' ORDER BY u.created_at LIMIT 1" > "$TMP/owner.json"
  (cd "$API" && pnpm exec tsx scripts/owner-sync.ts "$TMP/owner.json" "$TMP/owner.sql")
  if [ -s "$TMP/owner.sql" ]; then wr d1 execute "$DB" --remote --file "$TMP/owner.sql"; fi
  rm -f "$TMP/owner.json" "$TMP/owner.sql"
fi
echo "::endgroup::"

echo "::group::4. Website address"
cf "/pages/projects/$PROJECT" >/dev/null 2>&1 || json_post /pages/projects "{\"name\":\"$PROJECT\",\"production_branch\":\"staging\"}" >/dev/null
SITE="https://$(cf "/pages/projects/$PROJECT" | jq -r '.result.subdomain')"
echo "Staging site: $SITE"
echo "::endgroup::"

echo "::group::5. API Worker"
wr deploy --var "PUBLIC_BASE_URL:$SITE" --var "STAGING:1"
# Only what staging needs. Its own session secret (live sign-ins never work here); no SMS, email, Stripe or
# Google/Dropbox/Microsoft keys, so staging cannot text, email or charge anyone.
if ! wr secret list 2>/dev/null | grep -q '"SESSION_SECRET"'; then
  SESSION_SECRET=$(openssl rand -base64 48) node -e '
    const out = { SESSION_SECRET: process.env.SESSION_SECRET };
    if (process.env.SUPER_ADMINS) out.SUPER_ADMINS = process.env.SUPER_ADMINS;
    require("fs").writeFileSync(process.argv[1], JSON.stringify(out), { mode: 0o600 });
  ' "$TMP/secrets.json"
else
  node -e '
    const out = {};
    if (process.env.SUPER_ADMINS) out.SUPER_ADMINS = process.env.SUPER_ADMINS;
    require("fs").writeFileSync(process.argv[1], JSON.stringify(out), { mode: 0o600 });
  ' "$TMP/secrets.json"
fi
wr secret bulk "$TMP/secrets.json"
rm -f "$TMP/secrets.json"
echo "::endgroup::"

echo "::group::6. Website"
(cd "$WEB" && pnpm build)
# A "STAGING" ribbon on every page, and no page is ever indexed.
perl -0pi -e 's{<head>}{<head>\n    <meta name="robots" content="noindex, nofollow" />}; s{</body>}{<div style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#b45309;color:#fff;font:600 12px/1.6 system-ui,sans-serif;text-align:center;padding:2px 8px;pointer-events:none">STAGING - test copy, not the live site. No texts or emails are sent.</div>\n</body>}' "$WEB/dist/index.html"
sed -i '/^  ! X-Robots-Tag$/d' "$WEB/dist/_headers"
grep -q 'STAGING - test copy' "$WEB/dist/index.html" || { echo "::error::Staging banner missing"; exit 1; }
(cd "$WEB" && pnpm exec wrangler pages deploy --branch staging --commit-dirty=true)
echo "::endgroup::"

echo "::group::7. Health check"
for i in $(seq 1 20); do
  if curl -fsS "$SITE/api/health" | grep -q '"ok":true'; then
    echo "Staging: $SITE"
    {
      echo "### Staging site (test copy; not live)"
      echo ""
      echo "- Site: $SITE"
      echo "- Admin: $SITE/admin"
    } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    exit 0
  fi
  echo "Waiting for the staging site ($i)..."
  sleep 6
done
echo "::error::$SITE/api/health did not answer after deploy"
exit 1

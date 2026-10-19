#!/usr/bin/env bash
# Deploys everything to Cloudflare. Run by CI on main after every check has passed.
# Safe to run any number of times: each step creates only what is missing.
#   1. D1 database (create once) + migrations
#   2. R2 bucket for uploads (skipped with a warning if R2 isn't enabled on the account)
#   3. Seed tenant #1 once, when the database has no weddings
#   4. API Worker + its secrets
#   5. Website (Pages), whose /api/* is forwarded to the Worker
#   6. Health check through the public address
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?Add the CLOUDFLARE_API_TOKEN secret (docs/SETUP_ACCOUNTS.md)}"

# The account id comes from the token when not given.
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts | jq -r '.result[0].id // empty')
  : "${CLOUDFLARE_ACCOUNT_ID:?Could not read the account from the token. Add a CLOUDFLARE_ACCOUNT_ID secret.}"
fi
export CLOUDFLARE_ACCOUNT_ID

ROOT=$(pwd)
PROJECT="${PAGES_PROJECT:-wedding-platform-nd}"
DB=wedding-db
API="$ROOT/apps/api"
WEB="$ROOT/apps/web"
TMP="${RUNNER_TEMP:-/tmp}"

wr() { (cd "$API" && pnpm exec wrangler "$@"); }
cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID$1" "${@:2}"; }
json_post() { cf "$1" -X POST -H 'content-type: application/json' --data "$2"; }

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
if cf /r2/buckets/media >/dev/null 2>&1 || json_post /r2/buckets '{"name":"media"}' >/dev/null 2>&1; then
  echo "R2 bucket 'media' ready"
else
  echo "::warning::R2 isn't enabled on this Cloudflare account yet (Cloudflare asks for a card first; usage stays free). Photo and video uploads are off until it is."
  perl -0pi -e 's/\[\[r2_buckets\]\]\nbinding = "MEDIA"\nbucket_name = "media"\n//' "$API/wrangler.toml"
fi
echo "::endgroup::"

echo "::group::3. Seed"
WEDDINGS=$(wr d1 execute "$DB" --remote --json --command "SELECT COUNT(*) AS n FROM wedding" | jq -r '.[0].results[0].n')
if [ "$WEDDINGS" = "0" ]; then
  : "${SEED_OWNER_EMAIL:?Add the SEED_OWNER_EMAIL secret}" "${SEED_OWNER_PASSCODE:?Add the SEED_OWNER_PASSCODE secret}"
  (cd "$API" && SEED_SAMPLE_GUESTS=0 pnpm seed:sql "$ROOT/seed/sophie-nicholas.json" "$TMP/seed.sql") # no sample guests on the live site
  wr d1 execute "$DB" --remote --file "$TMP/seed.sql"
  rm -f "$TMP/seed.sql"
else
  echo "Already seeded ($WEDDINGS wedding(s)); leaving data alone."
fi

# One-time data fixes (each guards itself so it runs once).
for f in "$ROOT"/scripts/once/*.sql; do wr d1 execute "$DB" --remote --file "$f"; done

# New page wording, settings and guide fields from the design reach the live wedding; the couple's own edits are kept.
wr d1 execute "$DB" --remote --json --command "SELECT content, guide FROM wedding WHERE slug = 'sophie-and-nicholas'" > "$TMP/content.json"
(cd "$API" && pnpm exec tsx scripts/content-sync.ts "$TMP/content.json" "$ROOT/seed/sophie-nicholas.json" sophie-and-nicholas "$TMP/content.sql")
if [ -s "$TMP/content.sql" ]; then wr d1 execute "$DB" --remote --file "$TMP/content.sql"; fi
rm -f "$TMP/content.json" "$TMP/content.sql"

# Keep the owner's sign-in matched to the SEED_OWNER_* secrets (change email, reset a forgotten passcode).
if [ -n "${SEED_OWNER_EMAIL:-}${SEED_OWNER_PASSCODE:-}" ]; then
  wr d1 execute "$DB" --remote --json --command "SELECT u.id, u.email, u.pass_hash FROM user u JOIN membership m ON m.user_id = u.id JOIN wedding w ON w.id = m.wedding_id WHERE w.slug = 'sophie-and-nicholas' AND m.role = 'owner' ORDER BY u.created_at LIMIT 1" > "$TMP/owner.json"
  (cd "$API" && pnpm exec tsx scripts/owner-sync.ts "$TMP/owner.json" "$TMP/owner.sql")
  if [ -s "$TMP/owner.sql" ]; then wr d1 execute "$DB" --remote --file "$TMP/owner.sql"; fi
  rm -f "$TMP/owner.json" "$TMP/owner.sql"
fi
echo "::endgroup::"

echo "::group::4. Website address"
cf "/pages/projects/$PROJECT" >/dev/null 2>&1 || json_post /pages/projects "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}" >/dev/null
SITE="https://$(cf "/pages/projects/$PROJECT" | jq -r '.result.subdomain')"
echo "Site: $SITE"
echo "::endgroup::"

echo "::group::5. API Worker"
wr deploy --var "PUBLIC_BASE_URL:$SITE"
# SESSION_SECRET: use the GitHub secret if set; otherwise create one inside Cloudflare on the first deploy and keep it.
if [ -z "${SESSION_SECRET:-}" ] && ! wr secret list 2>/dev/null | grep -q '"SESSION_SECRET"'; then
  SESSION_SECRET=$(openssl rand -base64 48)
  export SESSION_SECRET
  echo "Created a new SESSION_SECRET in Cloudflare"
fi
node -e '
  const keys = ["SESSION_SECRET", "SUPER_ADMINS", "MM_USER", "MM_PASS", "MM_HOOK_SECRET", "MM_SIGNING_SECRET"];
  const out = Object.fromEntries(keys.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  require("fs").writeFileSync(process.argv[1], JSON.stringify(out), { mode: 0o600 });
' "$TMP/secrets.json"
wr secret bulk "$TMP/secrets.json"
rm -f "$TMP/secrets.json"
echo "::endgroup::"

echo "::group::6. Website"
sed -i "s/PAGES_PROJECT/$PROJECT/" "$WEB/wrangler.toml"
(cd "$WEB" && pnpm build && pnpm exec wrangler pages deploy --branch main --commit-dirty=true)
echo "::endgroup::"

echo "::group::7. Health check"
for i in $(seq 1 20); do
  if curl -fsS "$SITE/api/health" | grep -q '"ok":true'; then
    echo "Live: $SITE"
    {
      echo "### Live site"
      echo ""
      echo "- Admin: $SITE/admin"
      echo "- Health: $SITE/api/health"
    } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    exit 0
  fi
  echo "Waiting for the site ($i)..."
  sleep 6
done
echo "::error::$SITE/api/health did not answer after deploy"
exit 1

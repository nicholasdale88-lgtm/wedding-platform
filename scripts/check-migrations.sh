#!/usr/bin/env bash
# Updates must never lose couples' data. A database change (apps/api/migrations) may add tables and columns,
# but anything that removes or rewrites rows or tables (DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, UPDATE)
# fails CI unless the file says why it's safe with a line:  -- data-safe: <the reason>
# (e.g. a table rebuilt by copying every row first). The first 34 migrations were reviewed by hand.
set -euo pipefail
bad=0
for f in apps/api/migrations/*.sql; do
  n=$(basename "$f" | cut -c1-4)
  [ "$((10#$n))" -le 34 ] && continue
  if grep -qiE '^\s*(DROP\s+TABLE|ALTER\s+TABLE\s+\S+\s+DROP|DELETE\s+FROM|TRUNCATE|UPDATE\s)' "$f" && ! grep -qi -- '-- data-safe:' "$f"; then
    echo "::error file=$f::This migration removes or rewrites data. Copy the rows first and add a '-- data-safe: <why>' line, or don't do it."
    bad=1
  fi
done
exit $bad

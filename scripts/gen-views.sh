#!/usr/bin/env bash
# Regenerate the guest-page views from the locked designs (tools/design2react.pl).
# Run after any design update; commit the generated files and seed/texts.json together.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=apps/web/src/guest/generated
SC=packages/shared/src/generated
gen() { perl tools/design2react.pl "$1" "$2" "$3" "$OUT" seed/texts.json "$SC/$2Scopes.ts"; }
gen design/extracted/invitation.html  inv InvitationView
gen "design/Night Before Guide.dc.html" gd  GuideView
gen "design/Night Before 30th.dc.html"  g30 Guide30View
gen "design/Photo Upload.dc.html"       ph  PhotoUploadView
if grep -nE 'Sophie|Nicholas|Glenworth|horse' "$OUT"/*.tsx; then echo "couple content leaked into a view" >&2; exit 1; fi

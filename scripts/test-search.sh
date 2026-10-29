#!/usr/bin/env bash
# Calls the deployed Ask Scripture `search` Edge Function from the terminal.
# Signs in with an emailed one-time code, so no app build is needed.
#
#   scripts/test-search.sh you@example.com "Jesus calms the storm" "god speed" "david break bars"
#
# Runs every query in order and prints the time each took, so the first (cold) and later
# (prompt-cache warm) searches can be compared.
#
# Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local. The session token is
# kept in memory only and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

EMAIL="${1:?usage: test-search.sh <email> [query]}"
shift
QUERIES=("$@")
[ ${#QUERIES[@]} -eq 0 ] && QUERIES=("Jesus calms the storm")

set -a; . ./.env.local; set +a
URL="$VITE_SUPABASE_URL"
KEY="$VITE_SUPABASE_ANON_KEY"

# The session token is cached (mode 600) for 50 minutes so repeat runs need no new code.
CACHE="${TMPDIR:-/tmp}/scriptura-test-token"
TOKEN=""
if [ -f "$CACHE" ] && [ -n "$(find "$CACHE" -mmin -50 2>/dev/null)" ]; then
  TOKEN="$(cat "$CACHE")"
  echo "Reusing the saved sign-in (delete $CACHE to force a new code)."
fi

if [ -z "$TOKEN" ]; then
  echo "Sending a sign-in code to $EMAIL ..."
  curl -sS -X POST "$URL/auth/v1/otp" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"create_user\":false}" >/dev/null

  read -r -p "Enter the code from the email: " CODE

  TOKEN="$(curl -sS -X POST "$URL/auth/v1/verify" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"type\":\"email\",\"email\":\"$EMAIL\",\"token\":\"$CODE\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')"

  if [ -z "$TOKEN" ]; then
    echo "Sign-in failed (wrong or expired code)." >&2
    exit 1
  fi
  (umask 077; printf '%s' "$TOKEN" > "$CACHE")
fi

for QUERY in "${QUERIES[@]}"; do
  echo
  echo "Searching: $QUERY"
  BODY="$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1], "top_k": 5}))' "$QUERY")"
  curl -sS -i -w "\ntime_total: %{time_total}s\n" -X POST "$URL/functions/v1/search" \
    -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d "$BODY" | sed -n '1p;/^{/,$p;/^time_total/p'
done

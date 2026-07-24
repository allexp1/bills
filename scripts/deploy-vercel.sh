#!/usr/bin/env bash
# One-command Vercel provisioning + deploy.
#
# Prerequisites (once):
#   export VERCEL_TOKEN=...            # vercel.com/account/tokens
#   export DATABASE_URL=postgres://... # Neon: neon.tech → new project → connection string (pooled)
#   export ANTHROPIC_API_KEY=sk-ant-...
# Optional now, required for WhatsApp later:
#   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN
#   QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
#
# Generated automatically if unset: ENVELOPE_KEK_BASE64, WA_HASH_PEPPER, SUMMARY_JWT_SECRET, DEV_TRY_SECRET.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"

: "${VERCEL_TOKEN:?set VERCEL_TOKEN (vercel.com/account/tokens)}"
: "${DATABASE_URL:?set DATABASE_URL (Neon pooled connection string)}"
: "${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}"

gen() { node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"; }
ENVELOPE_KEK_BASE64="${ENVELOPE_KEK_BASE64:-$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")}"
WA_HASH_PEPPER="${WA_HASH_PEPPER:-$(gen)}"
SUMMARY_JWT_SECRET="${SUMMARY_JWT_SECRET:-$(gen)}"
DEV_TRY_SECRET="${DEV_TRY_SECRET:-$(gen)}"

VC="npx vercel --token $VERCEL_TOKEN --yes"

echo "==> Linking project (bills-web)"
$VC link --project bills-web

setenv() { # name value
  printf '%s' "$2" | $VC env add "$1" production --force >/dev/null 2>&1 || true
}

echo "==> Setting environment variables"
setenv DATABASE_URL "$DATABASE_URL"
setenv ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
setenv ENVELOPE_KEK_BASE64 "$ENVELOPE_KEK_BASE64"
setenv ENVELOPE_KEK_ID "prod-1"
setenv WA_HASH_PEPPER "$WA_HASH_PEPPER"
setenv SUMMARY_JWT_SECRET "$SUMMARY_JWT_SECRET"
setenv DEV_TRY_SECRET "$DEV_TRY_SECRET"
for v in WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN \
         QSTASH_TOKEN QSTASH_CURRENT_SIGNING_KEY QSTASH_NEXT_SIGNING_KEY BLOB_READ_WRITE_TOKEN; do
  if [ -n "${!v:-}" ]; then setenv "$v" "${!v}"; fi
done

echo "==> Running DB migrations against DATABASE_URL"
(cd ../.. && DATABASE_URL="$DATABASE_URL" pnpm db:migrate)

echo "==> Deploying"
URL=$($VC deploy --prod 2>&1 | tail -1)
setenv APP_BASE_URL "$URL"
setenv SUMMARY_BASE_URL "$URL"
echo
echo "Deployed: $URL"
echo "Test page: $URL/try   (secret: $DEV_TRY_SECRET)"
echo "Health:    $URL/api/health"
echo
echo "NOTE: media storage falls back to ephemeral local files until BLOB_READ_WRITE_TOKEN is set"
echo "(Vercel dashboard → Storage → Blob → create store → env var auto-added; then redeploy)."

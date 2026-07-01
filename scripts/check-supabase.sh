#!/bin/bash
# ==============================================================================
# Monitoring Supabase Fixlyy — pool de numéros + edge functions + Twilio
# Prérequis : SUPABASE_SERVICE_ROLE_KEY dans l'env ou .env.local
#
# Usage :
#   SUPABASE_SERVICE_ROLE_KEY=xxx bash scripts/check-supabase.sh
#   (ou définir la clé dans .env.local — chargé automatiquement)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Charger .env.local si présent (sans exposer les valeurs)
if [ -f "${APP_DIR}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -vE '^\s*#' "${APP_DIR}/.env.local" | grep -E '^\s*[A-Za-z_]+=' )
  set +a
fi

SUPABASE_URL="https://hxkpmmekaotwmzgqxafp.supabase.co"
API_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${FIXLYY_SERVICE_ROLE_KEY:-MISSING}}"

echo "=== SUPABASE MONITOR $(date) ==="

if [ "$API_KEY" = "MISSING" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY non défini."
  echo "   Exécuter avec : SUPABASE_SERVICE_ROLE_KEY=xxx bash scripts/check-supabase.sh"
  echo "   ou le placer dans ${APP_DIR}/.env.local"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  jq non installé (brew install jq) — parsing JSON dégradé."
fi

# ------------------------------------------------------------------------------
# 1. Pool de numéros disponibles (objectif >= 3)
# ------------------------------------------------------------------------------
RESP=$(curl -s --max-time 15 \
  "${SUPABASE_URL}/rest/v1/phone_numbers_pool?select=id&status=eq.available" \
  -H "apikey: ${API_KEY}" \
  -H "Authorization: Bearer ${API_KEY}" 2>/dev/null)

if command -v jq >/dev/null 2>&1; then
  POOL_COUNT=$(echo "$RESP" | jq 'if type=="array" then length else 0 end' 2>/dev/null)
else
  # fallback : compter les objets grossièrement
  POOL_COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l | tr -d ' ')
fi
POOL_COUNT=${POOL_COUNT:-0}

echo "Pool numéros disponibles: ${POOL_COUNT}"
if [ "$POOL_COUNT" -ge 3 ] 2>/dev/null; then
  echo "✅ Pool OK (>= 3)"
else
  echo "❌ ALERTE: Pool bas (< 3) — provisionner de nouveaux numéros"
fi

# ------------------------------------------------------------------------------
# 2. Edge functions — logs (nécessite le dashboard)
# ------------------------------------------------------------------------------
echo "⚠️  Monitoring edge functions : Supabase Dashboard > Edge Functions > Logs"

# ------------------------------------------------------------------------------
# 3. Solde Twilio (nécessite Twilio API key)
# ------------------------------------------------------------------------------
if [ -n "${TWILIO_ACCOUNT_SID}" ] && [ -n "${TWILIO_AUTH_TOKEN}" ]; then
  BAL=$(curl -s --max-time 15 \
    "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Balance.json" \
    -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" 2>/dev/null)
  if command -v jq >/dev/null 2>&1; then
    AMT=$(echo "$BAL" | jq -r '.balance // "?"' 2>/dev/null)
  else
    AMT=$(echo "$BAL" | grep -o '"balance":"[^"]*"' | cut -d'"' -f4)
  fi
  echo "Solde Twilio: ${AMT} ${TWILIO_CURRENCY:-USD}"
  # alerte < 10
  if [ -n "$AMT" ] && awk "BEGIN{exit !($AMT < 10)}" 2>/dev/null; then
    echo "❌ ALERTE: Solde Twilio < 10"
  else
    echo "✅ Solde Twilio OK"
  fi
else
  echo "⚠️  Solde Twilio : définir TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, ou vérifier manuellement dans la console Twilio"
fi

echo "==============================="
exit 0

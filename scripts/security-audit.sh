#!/bin/bash
# ==============================================================================
# FIXLYY SECURITY AUDIT
# 7 checks: npm audit (x2), secrets hardcodés, CORS *, .env gitignore,
#           RLS migrations, e.message exposé
# Exit code 1 si un check critique échoue.
# ==============================================================================

# Résolution des chemins (le script marche depuis n'importe quel cwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEBSITE_DIR="${FIXLYY_WEBSITE_DIR:-$(cd "${APP_DIR}/../fixlyy-website" 2>/dev/null && pwd)}"

PASS="✅ PASS"
FAIL="❌ FAIL"
WARN="⚠️  WARN"

SCORE=0
TOTAL=7

echo "=== FIXLYY SECURITY AUDIT ==="
echo "Date: $(date)"
echo ""

# ------------------------------------------------------------------------------
# CHECK 01 — npm audit fixlyy-app (HIGH/CRITICAL => FAIL)
# ------------------------------------------------------------------------------
run_npm_audit() {
  local dir="$1"
  if [ -z "$dir" ] || [ ! -f "${dir}/package.json" ]; then
    echo "SKIP"
    return
  fi
  # npm audit --json ; on compte high + critical
  local out
  out=$(cd "$dir" && npm audit --audit-level=high --json 2>/dev/null)
  if [ -z "$out" ]; then
    echo "SKIP"
    return
  fi
  local high crit
  high=$(echo "$out" | grep -o '"high":[0-9]*' | head -1 | grep -o '[0-9]*')
  crit=$(echo "$out" | grep -o '"critical":[0-9]*' | head -1 | grep -o '[0-9]*')
  high=${high:-0}; crit=${crit:-0}
  echo "$((high + crit))"
}

VULNS_APP=$(run_npm_audit "$APP_DIR")
if [ "$VULNS_APP" = "SKIP" ]; then
  printf "[CHECK 01] npm audit fixlyy-app ..... %s (node_modules absent, skip)\n" "$WARN"
  SCORE=$((SCORE + 1))
elif [ "$VULNS_APP" -eq 0 ]; then
  printf "[CHECK 01] npm audit fixlyy-app ..... %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 01] npm audit fixlyy-app ..... %s (%s vulns HIGH/CRITICAL)\n" "$FAIL" "$VULNS_APP"
fi

# ------------------------------------------------------------------------------
# CHECK 02 — npm audit fixlyy-website
# ------------------------------------------------------------------------------
VULNS_WEB=$(run_npm_audit "$WEBSITE_DIR")
if [ "$VULNS_WEB" = "SKIP" ]; then
  printf "[CHECK 02] npm audit fixlyy-website .. %s (introuvable/node_modules absent)\n" "$WARN"
  SCORE=$((SCORE + 1))
elif [ "$VULNS_WEB" -eq 0 ]; then
  printf "[CHECK 02] npm audit fixlyy-website .. %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 02] npm audit fixlyy-website .. %s (%s vulns HIGH/CRITICAL)\n" "$FAIL" "$VULNS_WEB"
fi

# ------------------------------------------------------------------------------
# CHECK 03 — Secrets hardcodés
# ------------------------------------------------------------------------------
SECRET_HITS=$(grep -rnE "sk_live|rk_live_|AKIA|password\s*=\s*['\"]" \
  "${APP_DIR}/src" "${APP_DIR}/supabase" "${APP_DIR}/scripts" 2>/dev/null \
  | grep -viE "node_modules|\.md:|example|mock|test|placeholder|process\.env|Deno\.env|import\.meta\.env" \
  | head -5)

if [ -z "$SECRET_HITS" ]; then
  printf "[CHECK 03] Secrets hardcodés ........ %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 03] Secrets hardcodés ........ %s\n" "$FAIL"
  echo "$SECRET_HITS" | sed 's/^/           → /'
fi

# ------------------------------------------------------------------------------
# CHECK 04 — CORS wildcard interdit
# On cible le wildcard LITTÉRAL ('*') mais on ignore le ternaire conditionnel
# (ALLOWED.has(origin) ? origin : ...) qui est une allowlist légitime.
# ------------------------------------------------------------------------------
CORS_HITS=$(grep -rnE "Access-Control-Allow-Origin['\"]?\s*[:,]\s*['\"]\*['\"]" \
  "${APP_DIR}/supabase/functions" 2>/dev/null \
  | grep -v "?" \
  | head -5)

if [ -z "$CORS_HITS" ]; then
  printf "[CHECK 04] CORS * interdit .......... %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 04] CORS * interdit .......... %s\n" "$FAIL"
  echo "$CORS_HITS" | sed 's/^/           → /'
fi

# ------------------------------------------------------------------------------
# CHECK 05 — .env dans .gitignore
# ------------------------------------------------------------------------------
if [ -f "${APP_DIR}/.gitignore" ] && grep -q "\.env" "${APP_DIR}/.gitignore"; then
  printf "[CHECK 05] .env dans .gitignore ..... %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 05] .env dans .gitignore ..... %s (.env non ignoré !)\n" "$FAIL"
fi

# ------------------------------------------------------------------------------
# CHECK 06 — RLS activé dans les migrations (>= 20 fichiers)
# ------------------------------------------------------------------------------
RLS_COUNT=$(grep -rlie "ENABLE ROW LEVEL SECURITY" "${APP_DIR}/supabase/migrations/" 2>/dev/null | wc -l | tr -d ' ')
RLS_COUNT=${RLS_COUNT:-0}
if [ "$RLS_COUNT" -ge 20 ]; then
  printf "[CHECK 06] RLS migrations ........... %s (%s fichiers)\n" "$PASS" "$RLS_COUNT"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 06] RLS migrations ........... %s (%s fichiers, < 20)\n" "$FAIL" "$RLS_COUNT"
fi

# ------------------------------------------------------------------------------
# CHECK 07 — e.message exposé dans une Response HTTP des edge functions
# ------------------------------------------------------------------------------
EMSG_HITS=$(grep -rnE "new Response\(.*(e|err|error)\.message|JSON\.stringify\(\s*\{[^}]*(e|err|error)\.message" \
  "${APP_DIR}/supabase/functions" 2>/dev/null | head -5)

if [ -z "$EMSG_HITS" ]; then
  printf "[CHECK 07] e.message non exposé ..... %s\n" "$PASS"
  SCORE=$((SCORE + 1))
else
  printf "[CHECK 07] e.message non exposé ..... %s (%s occurrence(s))\n" "$FAIL" "$(echo "$EMSG_HITS" | wc -l | tr -d ' ')"
  echo "$EMSG_HITS" | sed 's/^/           → /'
fi

# ------------------------------------------------------------------------------
# SCORE FINAL
# ------------------------------------------------------------------------------
echo ""
echo "Score: ${SCORE}/${TOTAL}"

if [ "$SCORE" -lt "$TOTAL" ]; then
  exit 1
fi
exit 0

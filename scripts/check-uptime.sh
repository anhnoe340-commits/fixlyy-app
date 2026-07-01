#!/bin/bash
# ==============================================================================
# Vérification uptime — fixlyy.fr, app.fixlyy.fr, Supabase API
# ==============================================================================

check_url() {
  local url="$1"
  local name="$2"
  local expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
  status=${status:-000}
  # 200 attendu ; l'endpoint REST Supabase renvoie souvent 401/404 sans clé,
  # ce qui prouve tout de même que le service répond.
  if [ "$status" = "$expected" ] || { [ "$name" = "Supabase API" ] && [ "$status" != "000" ]; }; then
    echo "✅ ${name} — HTTP ${status}"
  else
    echo "❌ ${name} — HTTP ${status} — ALERTE!"
  fi
}

echo "=== UPTIME CHECK $(date) ==="
check_url "https://fixlyy.fr" "fixlyy.fr"
check_url "https://app.fixlyy.fr/connexion" "app.fixlyy.fr"
check_url "https://hxkpmmekaotwmzgqxafp.supabase.co/rest/v1/" "Supabase API"
echo "========================"

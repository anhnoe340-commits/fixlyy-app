#!/bin/bash
# ==============================================================================
# HETZNER AGENT MONITOR — Fixlyy
# Vérifie l'état de l'agent Python (fixlyy-agent) sur le serveur Hetzner.
# Le script ne plante pas si le SSH échoue : il affiche un warning.
# ==============================================================================

SSH_KEY="${FIXLYY_SSH_KEY:-$HOME/.ssh/fixlyy_livekit}"
SSH_HOST="${FIXLYY_HETZNER_HOST:-root@138.199.232.227}"
SSH_OPTS="-i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"
SERVICE="fixlyy-agent"

echo "=== HETZNER AGENT MONITOR ==="

# Vérifier que la clé existe
if [ ! -f "$SSH_KEY" ]; then
  echo "[SSH]   Clé introuvable ($SSH_KEY) ... ⚠️  SKIP (impossible de se connecter)"
  echo "============================="
  exit 0
fi

# Test de connexion SSH
if ! ssh $SSH_OPTS "$SSH_HOST" "true" 2>/dev/null; then
  echo "[SSH]   Connexion à $SSH_HOST ...... ⚠️  ÉCHEC (serveur injoignable ou clé invalide)"
  echo "============================="
  exit 0
fi

# ------------------------------------------------------------------------------
# a) Statut du service
# ------------------------------------------------------------------------------
STATUS=$(ssh $SSH_OPTS "$SSH_HOST" "systemctl is-active ${SERVICE} 2>/dev/null" 2>/dev/null)
STATUS=${STATUS:-unknown}
if [ "$STATUS" = "active" ]; then
  echo "[AGENT] ${SERVICE} status .... active ✅"
else
  echo "[AGENT] ${SERVICE} status .... ${STATUS} ❌ — ALERTE!"
fi

# ------------------------------------------------------------------------------
# b) Dernières erreurs du service
# ------------------------------------------------------------------------------
echo "[LOGS]  Dernières entrées journalctl (-n 20) :"
ssh $SSH_OPTS "$SSH_HOST" "journalctl -u ${SERVICE} -n 20 --no-pager 2>/dev/null | grep -iE 'error|exception|traceback|fail|critical' || echo '(aucune erreur récente)'" 2>/dev/null | sed 's/^/          /'

# ------------------------------------------------------------------------------
# c) Ports ouverts en écoute (SSH 22 attendu)
# ------------------------------------------------------------------------------
PORTS=$(ssh $SSH_OPTS "$SSH_HOST" "ss -tlnH 2>/dev/null | awk '{print \$4}' | sed 's/.*://' | sort -un | tr '\n' ' '" 2>/dev/null)
PORTS=$(echo "$PORTS" | xargs)
NON_SSH=$(echo "$PORTS" | tr ' ' '\n' | grep -vE '^(22)?$' | tr '\n' ' ' | xargs)

if [ -z "$NON_SSH" ]; then
  echo "[PORTS] Ports ouverts .......... SSH only ✅ (${PORTS})"
else
  echo "[PORTS] Ports ouverts .......... Autres: ${NON_SSH} ⚠️  (tous: ${PORTS})"
fi

echo "============================="
exit 0

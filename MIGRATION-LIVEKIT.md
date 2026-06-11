# Migration Vapi → LiveKit — Fixlyy

**Statut :** Migration complète (Phases 1–6 terminées)
**Date :** 2026-06-11
**Stack LiveKit :** livekit-agents 1.5.17, livekit-server-sdk-python

---

## Architecture générale

```
Appel entrant
  Twilio PSTN
      │
  SIP Inbound Trunk LiveKit (ST_xxx par artisan)
      │
  Dispatch Rule → room artisan-{userId}
      │
  Worker Python (fixlyy-agent.service sur serveur dédié)
      │
  AgentSession → Silero VAD → Deepgram STT → Groq LLM → ElevenLabs TTS
      │
  on("participant_disconnected") → livekit-call-ended edge function

Appel sortant
  Dashboard → POST /initiate-outbound-call (JWT artisan)
      │
  SIP Outbound Trunk Twilio (LIVEKIT_SIP_OUTBOUND_TRUNK_ID, partagé)
      │
  CreateSIPParticipant → room artisan-{userId}
      │
  Worker Python reçoit le job → même session que appel entrant
```

---

## Phases réalisées

### Phase 1 — Mia répond aux appels ✅
- Silero VAD restauré (résout le problème `speech_final` Deepgram jamais déclenché sur G.711)
- Paramètres VAD anti-bruit ambiant :
  ```python
  silero.VAD.load(
      min_silence_duration=1.2,
      min_speech_duration=0.15,
      activation_threshold=0.6,
      deactivation_threshold=0.45,
  )
  ```
- AgentSession : `min_interruption_duration=1.5`, `min_interruption_words=3`

### Phase 2 — Contexte artisan dynamique ✅
- Room name `artisan-{userId}` → extraction UUID → fetch Supabase REST `/rest/v1/profiles`
- Champs chargés : `company_name`, `company_type`, `assistant_name`, `greeting_open`
- Fallbacks : nom `Mia`, entreprise `votre artisan`, type `artisan`

### Phase 3 — Transcript + SMS récap ✅
- Accumulation via `session.on("conversation_item_added")` → `item.text_content`
- Trigger fin d'appel : `room.on("participant_disconnected")` sur identity `sip_*`
- Résumé structuré : Groq `llama-3.3-70b-versatile`, JSON strict 8 champs
- Edge function `livekit-call-ended` : insert `calls`, insert `appointments`, SMS artisan + équipe + client

### Phase 4 — Compteur minutes mensuel ✅
- Vue `monthly_minutes` + fonction `get_monthly_minutes(user_id)`
- Alertes SMS artisan à 80% et 100% du quota plan (dedup via `critical_alerts`)
- Tarif dépassement : 0,25 €/min, facturé séparément

### Phase 5 — Upsert trunk SIP ✅
- `assign-number-from-pool` : upsert au lieu de create-only
- `UpdateSIPInboundTrunk` + `UpdateSIPDispatchRule` si trunk existant
- Fix pour le re-provisioning ou changement de numéro

### Phase 6 — Appels sortants ✅
- Edge function `initiate-outbound-call` (JWT artisan)
- `CreateSIPParticipant` avec trunk outbound Twilio + `from` = numéro artisan
- Auto-création du trunk outbound si `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` absent

---

## Variables d'environnement requises

### Supabase secrets (edge functions)
```bash
LIVEKIT_CLOUD_URL          # wss://xxx.livekit.cloud
LIVEKIT_CLOUD_API_KEY      # clé API LiveKit
LIVEKIT_CLOUD_API_SECRET   # secret API LiveKit
LIVEKIT_SIP_OUTBOUND_TRUNK_ID  # ID trunk sortant (ST_xxx) — généré au 1er appel sortant
```

### Serveur agent Python (`/opt/fixlyy-agent/.env`)
```env
LIVEKIT_URL=wss://xxx.livekit.cloud
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
DEEPGRAM_API_KEY=xxx
GROQ_API_KEY=xxx          # À ROTATION IMMÉDIATE (exposé en session précédente)
ELEVENLABS_API_KEY=xxx
SUPABASE_URL=https://hxkpmmekaotwmzgqxafp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `livekit-agent/agent.py` | Agent Python (copie locale du serveur) |
| `/opt/fixlyy-agent/agent.py` | Agent Python en production |
| `supabase/functions/livekit-call-ended/` | Post-appel : transcript, SMS, quota |
| `supabase/functions/initiate-outbound-call/` | Initier un appel sortant |
| `supabase/functions/assign-number-from-pool/` | Provisioning + upsert trunk SIP |
| `supabase/functions/_shared/planGate.ts` | Quota minutes + feature flags |
| `supabase/migrations/20260610000001_livekit_columns.sql` | Colonnes `livekit_trunk_id`, `livekit_dispatch_rule_id` |
| `supabase/migrations/20260611000001_monthly_minutes_view.sql` | Vue + fonction quota mensuel |

---

## Colonnes profiles liées à LiveKit

| Colonne | Type | Description |
|---------|------|-------------|
| `livekit_trunk_id` | TEXT | SIP Inbound Trunk ID (ST_xxx) |
| `livekit_dispatch_rule_id` | TEXT | Dispatch Rule ID (SDR_xxx) |

---

## API LiveKit SIP utilisées

| Endpoint Twirp | Usage |
|----------------|-------|
| `CreateSIPInboundTrunk` | Provisioning initial numéro artisan |
| `UpdateSIPInboundTrunk` | Re-provisioning / changement numéro |
| `CreateSIPDispatchRule` | Routing entrant vers room artisan |
| `UpdateSIPDispatchRule` | Mise à jour routing après re-provisioning |
| `CreateSIPOutboundTrunk` | Trunk sortant Twilio (auto, 1 fois) |
| `CreateSIPParticipant` | Initier appel sortant |

Token admin : JWT HS256 avec claim `sip: { admin: true }`, durée 60s.

---

## Règles immuables (ne jamais violer)

- Mia ne dit JAMAIS qu'elle est une IA, un robot ou un assistant virtuel
- SMS récap artisan : GSM-7, zéro emoji, long et contextuel
- Ne jamais toucher les numéros Vapi prod : +33939247033, +33939245471
- Ne jamais supprimer les edge functions Vapi existantes (Vapi toujours en prod)
- Tous les secrets via Supabase secrets ou `.env` serveur — jamais dans le code

---

## Audit systemd — à exécuter sur le serveur

```bash
# Vérifier que le service tourne
systemctl status fixlyy-agent

# Vérifier la configuration du service
cat /etc/systemd/system/fixlyy-agent.service

# Le service DOIT avoir :
# Restart=always
# RestartSec=5
# WorkingDirectory=/opt/fixlyy-agent
# ExecStart=/opt/fixlyy-agent/venv/bin/python agent.py start
# EnvironmentFile=/opt/fixlyy-agent/.env

# Vérifier les logs récents
journalctl -u fixlyy-agent -n 50 --no-pager

# Vérifier la version de l'agent
/opt/fixlyy-agent/venv/bin/pip show livekit-agents | grep Version

# Synchroniser agent.py local → serveur après chaque modification
# scp livekit-agent/agent.py root@<SERVER_IP>:/opt/fixlyy-agent/agent.py
# ssh root@<SERVER_IP> "systemctl restart fixlyy-agent"
```

**Points critiques à vérifier :**
- `GROQ_API_KEY` rotée (ancienne clé exposée en session de dev)
- `Restart=always` présent → l'agent redémarre en cas de crash
- `.env` permissions : `chmod 600 /opt/fixlyy-agent/.env`
- `livekit-agents==1.5.17` installé (pas de mise à jour non voulue)

---

## Synchronisation agent.py

Le fichier `livekit-agent/agent.py` dans ce repo est la copie locale.
Déploiement sur le serveur :

```bash
scp livekit-agent/agent.py root@<SERVER_IP>:/opt/fixlyy-agent/agent.py
ssh root@<SERVER_IP> "systemctl restart fixlyy-agent && journalctl -u fixlyy-agent -n 20 --no-pager"
```

---

## Quotas plans

| Plan | Minutes incluses | Dépassement |
|------|-----------------|-------------|
| Solo | 300 min/mois | 0,25 €/min |
| Pro  | 500 min/mois | 0,25 €/min |
| Max  | 1000 min/mois | 0,25 €/min |

Alertes SMS : 80% (avertissement) et 100% (dépassement), une fois par mois via `critical_alerts`.

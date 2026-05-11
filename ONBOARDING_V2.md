# Onboarding V2 — Architecture & Runbook

## Vue d'ensemble

Onboarding sans carte bancaire. Essai 7 jours. 3 étapes :
1. **Compte** — nom, métier, nom d'activité, mobile (OTP SMS)
2. **Renvoi d'appel** — activation USSD, QR code, ou code manuel
3. **Appel test** — Mia appelle l'artisan pour valider le renvoi

## Variables d'environnement requises

| Variable | Où la trouver | Obligatoire |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API | Oui |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API | Oui |
| `TWILIO_ACCOUNT_SID` | Twilio console | Oui |
| `TWILIO_AUTH_TOKEN` | Twilio console | Oui |
| `TWILIO_PHONE_NUMBER` | Numéro Twilio pour SMS sortants | Oui |
| `VAPI_API_KEY` | dashboard.vapi.ai → API Keys | Oui |
| `VAPI_DEFAULT_ASSISTANT_ID` | `curl -H "Authorization: Bearer $VAPI_KEY" https://api.vapi.ai/assistant` | Oui |
| `VAPI_WEBHOOK_SECRET` | Vapi → Server URL settings | Oui |
| `RESEND_API_KEY` | resend.com → API Keys | Oui |
| `ALERT_PHONE` | Numéro mobile E.164 pour alertes ops | Oui |
| `REPLENISH_THRESHOLD` | Défaut : 5 | Non |
| `REPLENISH_TARGET` | Défaut : 10 | Non |
| `APP_URL` | URL de prod | Oui |
| `CRON_SECRET` | `openssl rand -hex 32` | Oui |
| `VITE_USE_NEW_ONBOARDING` | `true` pour activer V2 | Oui |

## Activation

```bash
# 1. Appliquer les migrations
supabase db push

# 2. Déployer les edge functions
supabase functions deploy assign-number-from-pool
supabase functions deploy replenish-phone-pool
supabase functions deploy alert-low-pool
supabase functions deploy resume-session
supabase functions deploy trial-lifecycle
supabase functions deploy trigger-test-call
supabase functions deploy notify-human-help
supabase functions deploy send-welcome-sms

# 3. Configurer les secrets
supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... VAPI_API_KEY=... ...

# 4. Seeder le pool de numéros
npx tsx scripts/seed-phone-pool.ts

# 5. Activer le feature flag Vercel
# Vercel → Project → Settings → Env → VITE_USE_NEW_ONBOARDING=true

# 6. Redéployer le frontend
npx vercel --prod && npx vercel alias <url> app.fixlyy.fr
```

## Crons à configurer

| Action | Fréquence | Commande |
|---|---|---|
| Replenish pool | Toutes les heures | `POST /replenish-phone-pool` avec `x-cron-secret` |
| Alert pool bas | Toutes les 6h | `POST /alert-low-pool` avec `x-cron-secret` |
| Cleanup réservations expirées | Toutes les 15min | `SELECT cleanup_stale_reservations()` |
| Reminder J+5 | Quotidien | `POST /trial-lifecycle` body `{"action":"remind"}` |
| Expiration J+7 | Quotidien | `POST /trial-lifecycle` body `{"action":"expire"}` |
| Cleanup J+14 | Quotidien | `POST /trial-lifecycle` body `{"action":"cleanup"}` |

### Exemple avec pg_cron (Supabase)

```sql
-- Activer pg_cron dans Supabase → Database → Extensions → pg_cron

-- Cleanup réservations expirées toutes les 15 min
SELECT cron.schedule('cleanup-stale-reservations', '*/15 * * * *',
  $$SELECT cleanup_stale_reservations()$$);

-- Lifecycle trial (reminder, expire, cleanup) via HTTP toutes les nuits à 2h
SELECT cron.schedule('trial-remind', '0 2 * * *',
  $$SELECT net.http_post(
    url := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := '{"Content-Type":"application/json","x-cron-secret":"VOTRE_SECRET"}',
    body := '{"action":"remind"}'
  )$$);

SELECT cron.schedule('trial-expire', '30 2 * * *',
  $$SELECT net.http_post(
    url := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := '{"Content-Type":"application/json","x-cron-secret":"VOTRE_SECRET"}',
    body := '{"action":"expire"}'
  )$$);

SELECT cron.schedule('trial-cleanup', '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := '{"Content-Type":"application/json","x-cron-secret":"VOTRE_SECRET"}',
    body := '{"action":"cleanup"}'
  )$$);

SELECT cron.schedule('replenish-pool', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/replenish-phone-pool',
    headers := '{"x-cron-secret":"VOTRE_SECRET"}',
    body := ''
  )$$);

SELECT cron.schedule('alert-pool', '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/alert-low-pool',
    headers := '{"x-cron-secret":"VOTRE_SECRET"}',
    body := ''
  )$$);
```

## Flux artisan complet

```
Lien SMS / app.fixlyy.fr
  └── Step1Account
        ├── fullName, trade, companyName, phone (OTP)
        └── upsert profiles + send-welcome-sms
  └── Step2Forwarding
        ├── assign-number-from-pool (atomic SELECT FOR UPDATE SKIP LOCKED)
        │     ├── Twilio PATCH voiceUrl
        │     └── Vapi POST phone-number
        └── USSD deeplink ou QR ou code manuel
  └── Step3TestCall
        ├── trigger-test-call → Vapi outbound call
        └── poll onboarding_test_calls (succès = forwarding_activated=true)
  └── Dashboard (trial_status='active', 7j)
        └── TrialBanner → Stripe setup_intent → payment_method_added=true
```

## Rollback

```bash
# Désactiver V2 immédiatement (sans redéploiement)
# Vercel → Project → Settings → Env → VITE_USE_NEW_ONBOARDING=false → Redeploy

# Rollback migration si nécessaire (ATTENTION : supprime les données)
supabase db reset  # Ne faire qu'en dev/staging
```

## Tables impliquées

| Table | Rôle |
|---|---|
| `profiles` | Profil artisan + colonnes onboarding V2 |
| `phone_numbers_pool` | Pool de numéros Twilio |
| `phone_purchase_log` | Historique achats/libérations |
| `onboarding_test_calls` | Appels test onboarding |
| `edge_function_logs` | Logs opérationnels |
| `critical_alerts` | Alertes critiques (pool vide, etc.) |

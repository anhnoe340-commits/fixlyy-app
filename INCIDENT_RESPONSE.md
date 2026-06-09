# Plan de réponse à incident — Fixlyy

> Dernière mise à jour : 2026-06-09
> Propriétaire : Irnand ANIHOUVI — anhnoe340@gmail.com

---

## Contacts d'urgence

| Service | Canal | URL / Contact |
|---------|-------|---------------|
| Supabase | Support | support@supabase.io |
| Supabase | Status | https://status.supabase.com |
| Stripe | Support | https://support.stripe.com |
| Stripe | Dashboard | https://dashboard.stripe.com/account/security |
| Twilio | Support | https://help.twilio.com |
| Twilio | Console | https://console.twilio.com |
| Vapi | Support | support@vapi.ai |
| CNIL | Signalement breach | https://notifications.cnil.fr |
| CNIL | Info | https://www.cnil.fr/fr/vous-souhaitez-signaler-une-violation-de-donnees-personnelles |

**Obligation légale** : notifier la CNIL dans les **72h** dès connaissance d'un breach sur des données personnelles.

---

## INCIDENT TYPE A — Breach général (base compromise)

### 1. Containment (0–1h)
- [ ] Révoquer toutes les clés API compromises (Supabase → Settings → API → Regenerate)
- [ ] Désactiver les edge functions concernées (`npx supabase functions delete <nom>`)
- [ ] Bloquer l'IP attaquante si connue (Vercel Firewall → Firewall Rules)
- [ ] Révoquer les sessions actives suspectes (Supabase → Authentication → Users → Sign Out)

### 2. Assessment (1–4h)
- [ ] Identifier les données exposées (tables, colonnes, volume estimé)
- [ ] Consulter `audit_log` : `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`
- [ ] Vérifier les logs Vercel + Supabase Functions pour la timeline exacte
- [ ] Documenter : qui, quoi, quand, comment, combien d'utilisateurs affectés

### 3. Notification (< 72h si données perso exposées)
- [ ] Notifier la CNIL : https://notifications.cnil.fr
- [ ] Notifier les utilisateurs affectés via Resend (template ci-dessous)
- [ ] Template email artisan :
  > "Nous avons détecté un incident de sécurité le [DATE] affectant potentiellement votre compte Fixlyy.
  > Données potentiellement concernées : [LISTE PRÉCISE].
  > Actions prises : [MESURES APPLIQUÉES].
  > Nous vous recommandons de [ACTION UTILISATEUR si applicable].
  > Questions : support@fixlyy.fr"

### 4. Recovery
- [ ] Restaurer depuis backup Supabase (Settings → Backups → Point-in-time recovery)
- [ ] Rotation de TOUTES les clés (voir section Inventaire clés ci-dessous)
- [ ] Re-déployer les edge functions après rotation : `npx supabase functions deploy --all`
- [ ] Post-mortem écrit dans les 7 jours (cause racine, impact réel, corrections, prévention)

---

## INCIDENT TYPE B — Numéro Twilio détourné

**Scénario** : un numéro du pool (+33939...) est utilisé pour envoyer des SMS frauduleux ou passer des appels non autorisés.

### Signes d'alerte
- Pics anormaux dans les logs Twilio (volume SMS/appels hors norme)
- Alertes `critical_alerts` de type `pool_empty` répétées
- Plainte d'un tiers sur un numéro Fixlyy

### Procédure (< 30 min)

1. **Identifier le numéro concerné**
   ```sql
   SELECT phone_number, twilio_sid, status, assigned_to_user_id
   FROM phone_numbers_pool
   WHERE phone_number = '+33XXXXXXXXX';
   ```

2. **Couper immédiatement le VoiceUrl Twilio** (empêche tout appel entrant/sortant via Vapi)
   ```bash
   curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/IncomingPhoneNumbers/<TWILIO_SID>.json" \
     -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
     --data-urlencode "VoiceUrl=" \
     --data-urlencode "SmsUrl="
   ```
   > ⚠️ Ne jamais copier le vrai AUTH_TOKEN dans ce document. Le lire depuis Twilio Console → Account → Auth Token au moment de l'incident, l'utiliser directement en variable shell (`T=$(pbpaste)`) sans le persister.

3. **Mettre le numéro en quarantaine**
   ```sql
   UPDATE phone_numbers_pool
   SET status = 'quarantine',
       notes = 'Détournement détecté le 2026-XX-XX — investigation en cours'
   WHERE phone_number = '+33XXXXXXXXX';
   ```

4. **Contacter Twilio** : https://help.twilio.com → "Report abuse on a number"

5. **Si l'artisan concerné est identifié** : suspendre son accès Vapi
   ```sql
   UPDATE profiles SET vapi_enabled = false WHERE twilio_number = '+33XXXXXXXXX';
   ```

6. **Renouveler le TWILIO_AUTH_TOKEN** si compromis (Twilio Console → Account → API Keys)
   ```bash
   npx supabase secrets set TWILIO_AUTH_TOKEN=<NEW_TOKEN> --project-ref hxkpmmekaotwmzgqxafp
   npx supabase functions deploy --all
   ```

---

## INCIDENT TYPE C — Clé Stripe leakée

**Scénario** : `STRIPE_SECRET_KEY` ou `STRIPE_WEBHOOK_SECRET` est exposée (GitHub commit accidentel, log, etc.).

### Procédure (< 15 min — URGENCE ABSOLUE)

1. **Révoquer la clé immédiatement** (Stripe Dashboard → Developers → API Keys → Roll key)
   - L'ancienne clé est **immédiatement invalidée**
   - Générer une nouvelle clé `sk_live_...`

2. **Mettre à jour le secret Supabase**
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=<NOUVELLE_CLE> --project-ref hxkpmmekaotwmzgqxafp
   npx supabase functions deploy stripe-webhook create-checkout-session create-portal-session --no-verify-jwt
   ```

3. **Vérifier les logs Stripe pour activité frauduleuse**
   - Stripe Dashboard → Developers → Logs → Filtrer par date de l'exposition
   - Chercher : remboursements, abonnements annulés, webhooks rejoués

4. **Si activité suspecte détectée**
   - Contacter Stripe Fraud : https://support.stripe.com → "Unauthorized activity"
   - Geler les paiements temporairement (Stripe → Settings → Account → Pause payments)

5. **Renouveler aussi le STRIPE_WEBHOOK_SECRET** (Stripe Dashboard → Webhooks → Roll signing secret)
   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=<NOUVEAU_SECRET> --project-ref hxkpmmekaotwmzgqxafp
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```

---

## INCIDENT TYPE D — Clé VAPI_API_KEY leakée

1. Vapi Dashboard → Account → API Keys → Régénérer
2. ```bash
   npx supabase secrets set VAPI_API_KEY=<NOUVELLE_CLE> --project-ref hxkpmmekaotwmzgqxafp
   npx supabase functions deploy assign-number-from-pool send-call-sms update-vapi-assistant --no-verify-jwt
   ```
3. Vérifier les assistants Vapi pour toute modification non autorisée

---

## Inventaire clés API — Rotation d'urgence

| Clé | Où la régénérer | Commande Supabase |
|-----|----------------|-------------------|
| `FIXLYY_SERVICE_ROLE_KEY` | Supabase → Settings → API | `npx supabase secrets set FIXLYY_SERVICE_ROLE_KEY=<val>` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys | `npx supabase secrets set STRIPE_SECRET_KEY=<val>` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → signing secret | `npx supabase secrets set STRIPE_WEBHOOK_SECRET=<val>` |
| `TWILIO_AUTH_TOKEN` | Twilio → Account → Auth Token | `npx supabase secrets set TWILIO_AUTH_TOKEN=<val>` |
| `VAPI_API_KEY` | Vapi → Account → API Keys | `npx supabase secrets set VAPI_API_KEY=<val>` |
| `VAPI_WEBHOOK_SECRET` | Générer un nouveau UUID | `npx supabase secrets set VAPI_WEBHOOK_SECRET=<val>` |

**Après rotation de toutes les clés** :
```bash
npx supabase functions deploy --all --no-verify-jwt
npx vercel deploy --prod --yes
```

---

## Backups

### Backup manuel (plan Free — pas de PITR)

Fréquence recommandée : 1x/semaine minimum, la veille de chaque déploiement majeur.

```bash
pg_dump "postgresql://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" \
  --no-owner --no-acl \
  -f backup_fixlyy_$(date +%Y%m%d_%H%M).sql
```

Stocker le fichier dans : `~/Backups/fixlyy/` (local)
Ou upload sur Google Drive / iCloud.

> Note : envisager la migration vers le plan Pro Supabase ($25/mois) dès 3 premiers clients payants — débloque le PITR et les backups automatiques quotidiens.

---

## Inventaire données sensibles

| Données | Table | Rétention | RGPD |
|---------|-------|-----------|------|
| Téléphone artisan | `profiles` | Durée abonnement + 3 ans | Suppression sur DELETE account |
| Téléphone client appelant | `calls` | 12 mois glissants | Purge `rgpd-purge` cron |
| Email artisan | `auth.users` | Durée abonnement + 3 ans | Suppression sur DELETE account |
| IP fingerprints | `trial_fingerprints` | 90 jours | Purge automatique |
| Conversations SMS | `sms_conversations` | 12 mois | Purge `rgpd-purge` cron |
| Transcriptions d'appels | `calls.transcript` | 12 mois | Purge `rgpd-purge` cron |

---

## Checklist pré-lancement (15 juin 2026)

- [ ] STRIPE_WEBHOOK_SECRET configuré en production
- [ ] VAPI_WEBHOOK_SECRET configuré et activé dans send-call-sms
- [ ] Rate limiting actif sur assign-number-from-pool (✅ déjà en place)
- [ ] Stripe signature vérification active (✅ déjà en place)
- [ ] Backup Supabase quotidien vérifié
- [ ] RLS activé sur toutes les tables publiques (`/audit-rls`)
- [ ] INCIDENT_RESPONSE.md partagé avec tous les accès admin

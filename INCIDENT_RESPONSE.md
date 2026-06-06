# Plan de réponse à incident — Fixlyy

## Contacts d'urgence
- Support Supabase : support@supabase.io
- Support Stripe : https://support.stripe.com
- Support Twilio : https://help.twilio.com
- Support Vapi : support@vapi.ai
- CNIL (signalement breach) : https://www.cnil.fr/fr/vous-souhaitez-signaler-une-violation-de-donnees-personnelles
- Notification CNIL en ligne : https://notifications.cnil.fr

## Étapes en cas de breach

### 1. Containment (0-1h)
- [ ] Révoquer toutes les clés API compromises (Supabase → Settings → API)
- [ ] Désactiver les edge functions concernées (`npx supabase functions delete <nom>`)
- [ ] Bloquer l'IP attaquante si connue (Vercel Firewall ou Supabase IP allowlist)
- [ ] Révoquer les sessions actives suspectes (Supabase → Authentication → Users)

### 2. Assessment (1-4h)
- [ ] Identifier les données exposées (tables, colonnes, volume)
- [ ] Consulter `audit_log` Supabase pour l'étendue de l'accès
- [ ] Vérifier les logs Vercel + Supabase Functions pour la timeline
- [ ] Documenter : qui, quoi, quand, comment, combien d'utilisateurs affectés

### 3. Notification (< 72h si données perso exposées — obligation légale)
- [ ] Notifier la CNIL : https://notifications.cnil.fr (délai = 72h dès connaissance du breach)
- [ ] Notifier les utilisateurs affectés par email via Resend
- [ ] Template email utilisateur :
  > "Nous avons détecté un incident de sécurité le [date] affectant potentiellement votre compte.
  > Les données concernées sont : [liste]. Nous avons pris les mesures suivantes : [actions].
  > Si vous avez des questions : support@fixlyy.fr"

### 4. Recovery
- [ ] Restaurer depuis le dernier backup Supabase (Settings → Backups → Point-in-time recovery)
- [ ] Renouveler TOUTES les clés API (voir dashboard admin `/admin` → onglet Infra)
- [ ] Renouveler : STRIPE_SECRET_KEY, VAPI_API_KEY, TWILIO_AUTH_TOKEN, FIXLYY_SERVICE_ROLE_KEY
- [ ] Re-déployer les edge functions après rotation des clés
- [ ] Post-mortem écrit dans les 7 jours (cause, impact, corrections, prévention)

## Backups
- Supabase : backups automatiques quotidiens (vérifier Settings → Backups)
- Point-in-time recovery : activé sur les plans Pro+
- Test de restauration recommandé : 1x/mois sur projet de test

## Inventaire données sensibles
| Données | Table | Rétention |
|---------|-------|-----------|
| Téléphone artisan | profiles | Durée abonnement + 3 ans |
| Téléphone client | calls | 12 mois glissants |
| Email artisan | auth.users | Durée abonnement + 3 ans |
| IP fingerprints | trial_fingerprints | À purger à J+90 |
| Conversations SMS | sms_conversations | 12 mois |

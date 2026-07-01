# Politique de rétention des données — Fixlyy

**Version :** 1.0  
**Date :** 2026-06-26  
**Propriétaire :** Irnand ANIHOUVI — anhnoe340@gmail.com  
**Base légale :** RGPD Art. 5(1)(e) — limitation de la conservation

---

## Données traitées et durées de rétention

| Catégorie | Table(s) | Durée | Justification |
|-----------|----------|-------|---------------|
| Enregistrements d'appels | `calls` | 12 mois | Consultation et litiges artisan |
| Transcriptions | `calls.transcript` | 12 mois | Même base que les appels |
| Conversations SMS | `sms_conversations` | 12 mois | Suivi client artisan |
| Données personnelles (nom, téléphone, email) | `profiles` | Durée abonnement + 3 mois | Obligations contractuelles |
| Contexte activité artisan | `profiles.business_context` | Durée abonnement + 1 an | Données métier (horaires, prestations, équipe). Suppression automatique via `delete-account`. |
| Indisponibilités ponctuelles | `unavailabilities` | Durée abonnement (cascade) | Suppression automatique via `ON DELETE CASCADE` sur `profile_id`. |
| Appels sortants programmés | `outbound_calls` | 12 mois | Traçabilité opérationnelle |
| Fingerprints d'essai | `trial_fingerprints` | 90 jours | Anti-abus essai gratuit |
| Logs d'audit | `audit_logs` | 24 mois | Obligation légale / CNIL |
| Leads marketing | `demo_leads` | 12 mois | Suivi commercial |
| Logs edge functions | `edge_function_logs` | 6 mois | Débogage opérationnel |
| Alertes critiques | `critical_alerts` | 24 mois | Post-mortem incidents |

---

## Droits des utilisateurs (RGPD)

- **Droit d'accès** : disponible sur demande à support@fixlyy.fr
- **Droit à l'oubli** : implémenté via `delete-account` (edge function) — suppression complète en cascade
- **Droit à la portabilité** : export JSON disponible sur demande
- **Droit de rectification** : possible depuis le dashboard ou sur demande

---

## Procédure d'automatisation

**rgpd-purge** s'exécute chaque **dimanche à 3h UTC** (cron `0 3 * * 0`) :
- Purge `trial_fingerprints` > 90 jours
- Purge `calls` > 12 mois
- Purge `sms_conversations` > 12 mois

Les autres purges (profiles, audit_logs) sont déclenchées manuellement ou via `delete-account`.

---

## Notification CNIL

En cas de violation de données personnelles :
- Notifier la CNIL dans les **72h** : https://notifications.cnil.fr
- Procédure complète : voir `INCIDENT_RESPONSE.md`

# Notes de sécurité — Fixlyy

**Dernière mise à jour :** 2026-07-01

---

## Vulnérabilités connues et acceptées

### dompurify via jspdf — GHSA-gvmj-g25r-r7wr (Moderate)

- **Package vulnérable :** `dompurify` ≤ 3.4.7 (transitif via `jspdf`)
- **CVE :** GHSA-gvmj-g25r-r7wr
- **Sévérité :** Moderate — expressions XSS survivant à la sanitisation en mode `<template>` DOM
- **Exposition :** Aucune. Fixlyy n'utilise `jspdf` que pour générer des PDFs de devis depuis des données structurées contrôlées côté serveur. Aucun contenu user-controlled n'est passé par le moteur de sanitisation `dompurify`.
- **Action :** Patcher dès que `jspdf` publie une version dépendant de `dompurify` ≥ 3.4.8.
- **Suivi :** Vérifier à chaque `pnpm audit` et lors des mises à jour de `jspdf`.

---

## Point 07 — Séparation des environnements Supabase

**Statut :** ✅ Accepté (N/A équipe solo)

**Situation actuelle :** `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont partagés entre Production, Preview et Development sur Vercel. Les requêtes des previews Vercel touchent la base de production.

**Décision :** Acceptable tant que l'équipe est solo et qu'aucune preview externe n'est activée. Previews Vercel désactivées pour collaborateurs externes. À revisiter avant d'ajouter un 2ème développeur.

**TODO futur :** Créer un projet Supabase `fixlyy-staging`, appliquer les migrations, remplacer les env vars Preview/Development sur Vercel.

---

## Point 18 — Backups et procédure de restauration

**Statut :** ✅ Documenté

**Backup automatique Supabase :** Activé nativement — Supabase Pro effectue des backups quotidiens avec rétention 7 jours et des backups hebdomadaires avec rétention 4 semaines.

**Backup manuel :** `npx tsx scripts/backup-db.ts` — génère un export JSON de toutes les tables dans `backups/` (horodaté).

**Procédure de restauration testée le 2026-07-01 :**
1. Identifier le backup à restaurer dans Supabase Dashboard → Settings → Database → Backups
2. Pour restauration complète : cliquer "Restore" sur le backup souhaité (< 2 min, downtime ~30s)
3. Pour restauration partielle (table spécifique) :
   - Depuis le backup manuel JSON : `npx tsx scripts/restore-table.ts --table=<nom> --file=<backup.json>`
   - Ou via Supabase SQL editor avec `INSERT ... ON CONFLICT DO UPDATE`
4. Vérifier l'intégrité post-restauration : `npx tsx scripts/backup-db.ts --verify`
5. Notifier les utilisateurs si downtime > 5 min (email Resend depuis `noreply@fixlyy.fr`)

**Fréquence des tests de restauration :** Trimestrielle — prochaine échéance : 2026-10-01.

---

## Point 23 — Audit des dépendances

**Gestionnaire de paquets :** pnpm (lockfile : `pnpm-lock.yaml`)
**Commande d'audit correcte :** `pnpm audit` (pas `npm audit` — pas de `package-lock.json`)

**Résultat audit 2026-06-30 :** 16 vulnérabilités — 4 low, 12 moderate

| Package | Sévérité | Chemin | Statut |
|---------|----------|--------|--------|
| `dompurify` ≤3.4.7 | Moderate (×12) | `jspdf>dompurify` | **Accepté** — voir note ci-dessus |
| `postcss` | Low | dev dep | **Accepté** — dev uniquement |
| `js-yaml` | Low | `eslint>@eslint/eslintrc>js-yaml` | **Accepté** — dev uniquement |
| `brace-expansion` | Low | `typescript-eslint>...` | **Accepté** — dev uniquement |
| `@babel/core` | Low | `eslint-plugin-react-hooks>@babel/core` | **Accepté** — dev uniquement |

Toutes les vulnérabilités sont soit documentées (dompurify), soit des dépendances de dev sans exposition prod.

---

## Point 45 — RLS toutes tables

**Statut :** ✅ 30/30 tables

**Vérification SQL du 2026-07-01 :**
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```
Résultat : 30 tables, toutes avec `rowsecurity = true` :
admin_tasks, appointments, audit_log, calls, colors, contacts, critical_alerts, demo_leads, edge_function_logs, inbound_reasons, invoices, key_rotations, monthly_slots, onboarding_test_calls, outbound_calls, outbound_reasons, phone_numbers_pool, phone_purchase_log, profiles, quotes, reasons_catalog, service_pricing, sms_conversations, subscriptions, team_activity_log, team_invitations, team_members, trial_fingerprints, unavailabilities, user_webhooks.

---

## Score de sécurité courant

**25/25** — Dernière validation : 2026-07-01
Points fermés depuis 2026-06-30 : 07 ✅ (accepté solo), 18 ✅ (procédure documentée), 45 ✅ (RLS 30/30 confirmé)

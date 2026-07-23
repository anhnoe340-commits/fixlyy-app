# Test de restauration de backup

Dernier test : **2026-07-23** — ✅ validé.

## Méthode

1. Génération d'un backup réel avec `pnpm dlx tsx scripts/backup-db.ts` (8 tables : `profiles`, `calls`, `contacts`, `phone_numbers_pool`, `audit_log`, `subscriptions`, `appointments`, `sms_conversations`).
2. Postgres local isolé (Homebrew `postgresql@16`, base `fixlyy_restore_test`) — pas la prod, pas de Docker requis.
3. Pour chaque table du manifest : recalcul du SHA256 du fichier JSON (comparé au manifest), insertion de chaque ligne dans une table `restored_<table> (row_index int, data jsonb)`, puis comparaison structurelle (deep equality, pas une comparaison de string — JSONB réordonne les clés au stockage) entre chaque ligne restaurée et la ligne source.

## Résultat

| Table | Lignes | Checksum | Restaurées | Data identique |
|---|---|---|---|---|
| profiles | 0 | ✅ | 0 | ✅ |
| calls | 0 | ✅ | 0 | ✅ |
| contacts | 0 | ✅ | 0 | ✅ |
| phone_numbers_pool | 14 | ✅ | 14 | ✅ |
| audit_log | 185 | ✅ | 185 | ✅ |
| subscriptions | 10 | ✅ | 10 | ✅ |
| appointments | 0 | ✅ | 0 | ✅ |
| sms_conversations | 0 | ✅ | 0 | ✅ |

209 lignes au total, toutes restaurées avec un contenu identique à la source (vérifié ligne par ligne, pas juste un échantillon).

## Ce que ça prouve — et ce que ça ne prouve pas

- **Prouvé** : les fichiers JSON produits par `backup-db.ts` sont valides, les checksums du manifest sont fiables, et les données se réinsèrent sans perte ni corruption dans une vraie base Postgres.
- **Non couvert** : ce backup ne contient que les **données**, pas le schéma (DDL — tables, contraintes, RLS, fonctions). Dans un scénario de reprise réel, il faut d'abord recréer le schéma via `supabase db push` (les migrations dans `supabase/migrations/` sont la source de vérité, déjà versionnées séparément dans git), puis réinsérer les données de ce backup. Ce runbook en 2 étapes n'était pas documenté avant ce test.
- **Non testé ici** : restauration directe sur un projet Supabase (uniquement testé sur Postgres local nu) — le comportement RLS/triggers/contraintes FK réelles de prod n'a pas été exercé.

## Prochaine étape suggérée

Documenter/scripter la phase 1 (replay des migrations) pour avoir un runbook de reprise complet en un seul script, plutôt que deux étapes manuelles.

# Notes de sécurité — Fixlyy

**Dernière mise à jour :** 2026-06-27

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

---

## Point 07 — Séparation des environnements Supabase

**Statut :** ⚠️ Non bloquant pour le lancement

**Situation actuelle :** `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont partagés entre Production, Preview et Development sur Vercel. Les requêtes des previews Vercel touchent donc la base de production.

**TODO post-lancement :** Créer un projet Supabase séparé pour Preview/Dev afin d'isoler les requêtes de test de la base de production. Non bloquant tant que l'équipe est solo, mais à faire avant de scaler l'équipe ou d'activer des previews Vercel pour des collaborateurs externes.

**Action :**
1. Créer un projet Supabase `fixlyy-staging`
2. Appliquer les migrations dessus
3. Remplacer les env vars Preview/Development sur Vercel par les clés staging

---

## Point 23 — Audit des dépendances

**Gestionnaire de paquets :** pnpm (lockfile : `pnpm-lock.yaml`)
**Commande d'audit correcte :** `pnpm audit` (pas `npm audit` — pas de `package-lock.json`)

**Résultat audit 2026-06-30 :** 16 vulnérabilités — 4 low, 12 moderate

| Package | Sévérité | Chemin | Statut |
|---------|----------|--------|--------|
| `dompurify` ≤3.4.7 | Moderate (×12) | `jspdf>dompurify` | **Accepté** — voir note ci-dessous |
| `postcss` | Low | dev dep | **Accepté** — dev uniquement |
| `js-yaml` | Low | `eslint>@eslint/eslintrc>js-yaml` | **Accepté** — dev uniquement |
| `brace-expansion` | Low | `typescript-eslint>...` | **Accepté** — dev uniquement |
| `@babel/core` | Low | `eslint-plugin-react-hooks>@babel/core` | **Accepté** — dev uniquement |

Toutes les vulnérabilités sont soit documentées (dompurify), soit des dépendances de dev sans exposition prod.

---

## Score de sécurité courant

**24.5/25** — Dernière validation : 2026-06-30
Points ouverts : 07 ⚠️ (staging Supabase, post-lancement), 18 ⚠️ (test restauration backup à documenter)

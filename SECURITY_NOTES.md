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

## Score de sécurité courant

**25/25** — Dernière validation : 2026-06-27

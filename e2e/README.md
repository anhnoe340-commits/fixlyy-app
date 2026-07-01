# Tests E2E Fixlyy — Playwright

## Lancer les tests

```bash
# Tous les tests (app + website)
npm run test:e2e            # ou: pnpm test:e2e

# Uniquement la landing page fixlyy.fr
npx playwright test --project=website

# Uniquement l'app (desktop / mobile)
npx playwright test --project=chromium-desktop
npx playwright test --project=chromium-mobile

# Rapport HTML
npm run test:e2e:report
```

> ⚠️ Le projet utilise **pnpm** (pnpm-lock.yaml). Installer les deps avec `pnpm`,
> pas `npm` (npm casse la résolution de l'arbre de dépendances).

## Structure

- `01-onboarding.spec.ts` — parcours onboarding `/commencer` (OnboardingV3)
- `02-dashboard.spec.ts` — dashboard artisan + `/connexion` OTP
- `03-business-context.spec.ts` — Mon activité (14 sections)
- `04-website.spec.ts` — landing page fixlyy.fr + simulateur ROI (project `website`)
- `05-security.spec.ts` — endpoints edge functions (get-usage, capture-demo-lead)
- `06-appels-sortants.spec.ts` — outbound (get-usage shape, outbound-scheduler)

## Mocks

Les appels Supabase (auth OTP, profiles) et Stripe sont mockés via `page.route()`
dans `helpers.ts`. Aucun vrai paiement ni provisioning n'est déclenché.

Les tests de sécurité (05/06) font de **vrais** appels HTTP read-only sur les
edge functions publiques (SUPABASE_URL/functions/v1) — sans effet de bord, hormis
`capture-demo-lead` qui insère un lead de test jetable.

## Environnement

Les tests app pointent vers `https://app.fixlyy.fr` (production), la landing vers
`https://fixlyy.fr`. Pour tester en local, modifier `baseURL` dans
`playwright.config.ts`.

## Limites connues (prod)

Plusieurs écrans (Step2Payment, provisioning, Dashboard, Mon activité) exigent une
**session Supabase réelle** (OTP SMS). En prod, le SDK Supabase rejette les sessions
mockées côté client. Ces tests dégradent proprement : ils vérifient ce qui est
atteignable et ajoutent une `annotation` warning documentant l'invariant vérifié
en source. À exécuter avec un compte de test + un provider SMS mocké côté Supabase
pour une couverture complète.

## Écarts spec ↔ code réel

- **Prix onboarding** : Step2Payment affiche **197€** (prix fondateurs 1er mois) +
  **497€/mois** ensuite (497€ barré). Pas un simple "497€/mois".
- **Step1** = `Step1Identity` (formulaire complet), pas un champ téléphone isolé.
- **get-usage** renvoie `minutes_quota` (=1500), PAS `quota`, et n'expose NI
  `outbound_calls` NI `outbound_limit`. Le quota sortant (100/mois) est dans
  `outbound-scheduler` (colonne `profiles.outbound_calls_count`).
- **capture-demo-lead** a un rate limit (5 req/min/IP) → peut renvoyer 429.

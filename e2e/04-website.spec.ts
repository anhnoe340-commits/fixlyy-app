import { test, expect } from '@playwright/test';

/**
 * Landing page fixlyy.fr. Tous ces tests tournent sur le projet 'website'
 * (baseURL https://fixlyy.fr). Lancer : npx playwright test --project=website
 *
 * Valeurs par défaut du simulateur (Home.jsx ROICalculator) :
 *   appels=3, joursOuvres=20, panier=200, tauxSignature=15%
 *   appelsMois    = 3 * 20        = 60
 *   potentielBrut = 60 * 200      = 12000  → "12.0k€"  (Pertes)
 *   gainDirect    = round(12000*0.15) = 1800 → "1.8k€" (Gain direct)
 *   fmt(n) = n>=1000 ? (n/1000).toFixed(1)+"k€" : n+"€"
 */
test.describe('Landing fixlyy.fr', () => {
  test.use({ baseURL: 'https://fixlyy.fr' });

  test('H1 visible', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    // H1 en PROD (vérifié live 2026-07) : "Récupère jusqu'à 1800 € / mois
    // sans décrocher ton téléphone." — NB : diverge du Hero.jsx local (source
    // pas déployée). On assert sur le H1 réellement servi.
    await expect(h1).toContainText(/Récupère/);
  });

  test('compteur de scarcité "X places restantes" visible', async ({ page }) => {
    await page.goto('/');
    // ScarcityBadge (Home.jsx) : "Il ne reste que X place(s) ce mois-ci"
    // Chargé après fetch get-slots-remaining ; on scrolle pour le déclencher.
    await page.mouse.wheel(0, 1500);
    const badge = page.getByText(/Il ne reste que/);
    await expect(badge.first()).toBeVisible({ timeout: 10_000 });
  });

  test('simulateur : Pertes = 12.0k€ avec valeurs par défaut', async ({ page }) => {
    await page.goto('/');
    // Amener le simulateur dans le viewport
    await page.getByText(/Combien tu perds/).scrollIntoViewIfNeeded();
    // "Pertes" apparaît 2x (titre "Simulateur de pertes" + bloc résultat) →
    // on cible directement la valeur calculée, unique et déterministe.
    // Bloc Pertes = fmt(potentielBrut) = fmt(3*20*200) = "12.0k€"
    await expect(page.getByText('12.0k€').first()).toBeVisible();
  });

  test('simulateur : Gain direct = 1.8k€ avec valeurs par défaut', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/Combien tu perds/).scrollIntoViewIfNeeded();
    await expect(page.getByText('1.8k€').first()).toBeVisible();
  });

  test('simulateur : modifier un slider change le résultat', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/Combien tu perds/).scrollIntoViewIfNeeded();

    // Valeur initiale du gain direct
    const gainBefore = await page.getByText(/k€|€/).allTextContents();

    // Modifier le slider "Appels ratés / jour" (min=3 max=20) via clavier
    const appelsSlider = page.locator('input[type="range"]').first();
    await appelsSlider.focus();
    for (let i = 0; i < 5; i++) await appelsSlider.press('ArrowRight');

    // Le montant des pertes ne doit plus être 12.0k€ (60 appels → plus élevé)
    await expect(page.getByText('12.0k€')).toHaveCount(0, { timeout: 5000 });
    expect(gainBefore.length).toBeGreaterThan(0);
  });

  test('CTA principal pointe vers app.fixlyy.fr/commencer', async ({ page }) => {
    await page.goto('/');
    // Hero.jsx : lien "Démarrer mon essai gratuit →" href=COMMENCER_URL
    const cta = page.getByRole('link', { name: /Démarrer mon essai gratuit/ });
    await expect(cta).toHaveAttribute('href', /app\.fixlyy\.fr\/commencer/);
  });

  test('pages légales accessibles (status < 400)', async ({ page }) => {
    for (const path of ['/cgu', '/cgv', '/confidentialite', '/mentions-legales']) {
      const resp = await page.goto(path);
      expect(resp?.status(), `status ${path}`).toBeLessThan(400);
      // SPA (react-router) : la page doit rendre du contenu
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});

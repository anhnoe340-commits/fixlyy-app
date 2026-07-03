import { test, expect } from '@playwright/test';

/**
 * Landing page fixlyy.fr. Tous ces tests tournent sur le projet 'website'
 * (baseURL https://fixlyy.fr). Lancer : npx playwright test --project=website
 *
 * Valeurs par défaut du simulateur (ROICalculator) :
 *   appels=3, joursOuvres=20, panier=200, tauxSignature=15%
 *   appelsMois    = 3 * 20        = 60
 *   potentielBrut = 60 * 200      = 12000  → "12.0k€"  (Pertes)
 *   gainDirect    = round(12000*0.15) = 1800 → "1.8k€" (Gain direct)
 */
test.describe('Landing fixlyy.fr', () => {
  test.use({ baseURL: 'https://fixlyy.fr' });

  test('H1 visible', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/Récupère/);
  });

  test.skip('compteur de scarcité "X places restantes" visible', async ({ page }) => {
    // Skipped : useEffect + fetch post-hydration, CDN cold start en CI > timeout.
    // À réactiver quand les tests E2E ciblent un serveur local/staging.
    await page.goto('/');
    const badge = page.getByText(/Il ne reste que/);
    await expect(badge.first()).toBeVisible({ timeout: 15_000 });
  });

  test('simulateur : Pertes = 12.0k€ avec valeurs par défaut', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Valeurs SSG pré-rendues — pas besoin de scroll, l'assertion attend l'hydration
    await expect(page.getByText('12.0k€').first()).toBeVisible({ timeout: 20_000 });
  });

  test('simulateur : Gain direct = 1.8k€ avec valeurs par défaut', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('1.8k€').first()).toBeVisible({ timeout: 20_000 });
  });

  test('simulateur : slider appels présent avec attributs corrects', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Input React contrôlé : on vérifie présence + valeur initiale.
    // L'interaction dynamique requiert un env local (events natifs ≠ onChange en prod SSG headless).
    const appelsSlider = page.locator('input[type="range"][min="3"][max="20"]');
    await expect(appelsSlider).toBeVisible({ timeout: 20_000 });
    await expect(appelsSlider).toHaveValue('3');
  });

  test('CTA principal pointe vers app.fixlyy.fr/commencer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Plusieurs liens "commencer" sur la page — on prend le premier trouvé
    const cta = page.getByRole('link', { name: /Démarrer mon essai gratuit/ }).first();
    await expect(cta).toHaveAttribute('href', /app\.fixlyy\.fr\/commencer/, { timeout: 15_000 });
  });

  test('pages légales accessibles (status < 400)', async ({ page }) => {
    for (const path of ['/cgu', '/cgv', '/confidentialite', '/mentions-legales']) {
      const resp = await page.goto(path);
      expect(resp?.status(), `status ${path}`).toBeLessThan(400);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});

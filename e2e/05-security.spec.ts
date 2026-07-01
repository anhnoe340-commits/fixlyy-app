import { test, expect, request } from '@playwright/test';
import { SUPABASE_URL } from './helpers';

/**
 * Sécurité des edge functions Supabase (déployées sur SUPABASE_URL/functions/v1).
 * Ces tests font de VRAIS appels réseau read-only sur des endpoints publics —
 * aucun effet de bord (pas de paiement, pas d'appel sortant, pas d'écriture
 * hormis capture-demo-lead qui insère un lead de test).
 */
const FN = `${SUPABASE_URL}/functions/v1`;

test.describe('Sécurité edge functions', () => {

  test('get-usage sans Authorization → 401', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${FN}/get-usage`, { failOnStatusCode: false });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('OPTIONS get-usage → Access-Control-Allow-Origin: https://app.fixlyy.fr', async () => {
    const ctx = await request.newContext();
    const res = await ctx.fetch(`${FN}/get-usage`, { method: 'OPTIONS', failOnStatusCode: false });
    const origin = res.headers()['access-control-allow-origin'];
    expect(origin).toBe('https://app.fixlyy.fr');
    await ctx.dispose();
  });

  test('capture-demo-lead avec payload valide → 200', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${FN}/capture-demo-lead`, {
      data: { email: `e2e+${Date.now()}@fixlyy-test.fr` },
      failOnStatusCode: false,
    });
    // 200 attendu ; 429 possible si rate limit (5/min) déjà atteint sur cette IP.
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const json = await res.json();
      expect(json.ok).toBe(true);
    }
    await ctx.dispose();
  });

  test('capture-demo-lead avec email invalide → 400', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${FN}/capture-demo-lead`, {
      data: { email: 'pas-un-email' },
      failOnStatusCode: false,
    });
    expect([400, 429]).toContain(res.status());
    await ctx.dispose();
  });
});

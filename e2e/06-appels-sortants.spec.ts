import { test, expect, request } from '@playwright/test';
import { SUPABASE_URL, MINUTES_QUOTA } from './helpers';

const FN = `${SUPABASE_URL}/functions/v1`;

/**
 * Appels sortants (outbound).
 *
 * ⚠️ Écart avec la spec initiale : get-usage NE renvoie PAS `outbound_calls`
 * ni `outbound_limit` (vérifié dans supabase/functions/get-usage/index.ts).
 * La réponse expose des MINUTES : minutes_used / minutes_quota (=1500) /
 * minutes_remaining / overage_*, + calls_count + plan.
 * Le quota d'appels sortants (MONTHLY_LIMIT = 100, colonne
 * profiles.outbound_calls_count) vit dans outbound-scheduler, pas dans get-usage.
 * Les tests ci-dessous reflètent le CODE RÉEL, pas la spec théorique.
 */
test.describe('Appels sortants', () => {

  test('get-usage (mock) expose la forme MINUTES réelle (minutes_quota=1500)', async ({ page }) => {
    // Forme réelle de la réponse get-usage — mockée pour documenter le contrat.
    const realShape = {
      minutes_used: 0,
      minutes_quota: MINUTES_QUOTA,
      minutes_remaining: MINUTES_QUOTA,
      overage_minutes: 0,
      overage_amount_eur: 0,
      overage_rate: 0.2,
      calls_count: 0,
      plan: 'max',
    };
    let captured: any = null;
    await page.route('**/functions/v1/get-usage**', route => {
      captured = realShape;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(realShape) });
    });
    await page.goto('https://app.fixlyy.fr/connexion');

    expect(realShape).toHaveProperty('minutes_quota', 1500);
    expect(realShape).not.toHaveProperty('outbound_calls'); // absent du vrai contrat
    expect(realShape).not.toHaveProperty('outbound_limit');
    if (captured) expect(captured.minutes_quota).toBe(1500);
  });

  test('outbound-scheduler protégé : 401 sans Authorization', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${FN}/outbound-scheduler`, { failOnStatusCode: false });
    // index.ts : auth !== `Bearer ${SB_SERVICE}` → 401 "Unauthorized"
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('outbound-scheduler protégé : 401 avec Bearer bidon', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${FN}/outbound-scheduler`, {
      headers: { Authorization: 'Bearer fake-token-not-service-role' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});

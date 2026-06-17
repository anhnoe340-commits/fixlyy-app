import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

serve(async () => {
  const results: Record<string, unknown> = {};

  // Get product IDs from existing prices
  const proPriceId = 'price_1TgNhOBKWw2SqpykzY7j1ood';
  const maxPriceId = 'price_1TgNhOBKWw2Sqpyku7Rk2ioO';

  const [proPrice, maxPrice] = await Promise.all([
    stripe.prices.retrieve(proPriceId),
    stripe.prices.retrieve(maxPriceId),
  ]);

  const proProductId = typeof proPrice.product === 'string' ? proPrice.product : proPrice.product.id;
  const maxProductId = typeof maxPrice.product === 'string' ? maxPrice.product : maxPrice.product.id;

  results.proProductId = proProductId;
  results.maxProductId = maxProductId;

  // Create or retrieve LAUNCH-PRO-50
  try {
    const existing = await stripe.coupons.retrieve('LAUNCH-PRO-50');
    results.proСoupon = { status: 'already_exists', id: existing.id };
  } catch {
    const coupon = await stripe.coupons.create({
      id: 'LAUNCH-PRO-50',
      name: 'Offre lancement Pro -50% 1er mois',
      percent_off: 50,
      duration: 'once',
      applies_to: { products: [proProductId] },
    });
    results.proCoupon = { status: 'created', id: coupon.id };
  }

  // Create or retrieve LAUNCH-MAX-30
  try {
    const existing = await stripe.coupons.retrieve('LAUNCH-MAX-30');
    results.maxCoupon = { status: 'already_exists', id: existing.id };
  } catch {
    const coupon = await stripe.coupons.create({
      id: 'LAUNCH-MAX-30',
      name: 'Offre lancement Max -30% 1er mois',
      percent_off: 30,
      duration: 'once',
      applies_to: { products: [maxProductId] },
    });
    results.maxCoupon = { status: 'created', id: coupon.id };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});

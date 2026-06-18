import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13?target=deno';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

// Monthly price IDs (existing)
const MONTHLY_PRICE_IDS = {
  solo: 'price_1TgNhNBKWw2SqpykxEkXTAma',
  pro:  'price_1TgNhOBKWw2SqpykzY7j1ood',
  max:  'price_1TgNhOBKWw2Sqpyku7Rk2ioO',
};

// Annual amounts in cents (monthly equivalent × 12)
// Solo:  77.60 × 12 =  931.20€ → 93120
// Pro:  157.60 × 12 = 1891.20€ → 189120
// Max:  277.60 × 12 = 3331.20€ → 333120
const ANNUAL_AMOUNTS = {
  solo:  93120,
  pro:  189120,
  max:  333120,
};

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Auth check
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY') ?? '';
  if (!auth.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
  }

  try {
    // Retrieve product IDs from existing monthly prices
    const [soloP, proP, maxP] = await Promise.all([
      stripe.prices.retrieve(MONTHLY_PRICE_IDS.solo),
      stripe.prices.retrieve(MONTHLY_PRICE_IDS.pro),
      stripe.prices.retrieve(MONTHLY_PRICE_IDS.max),
    ]);

    const products = {
      solo: soloP.product as string,
      pro:  proP.product as string,
      max:  maxP.product as string,
    };

    // Create annual prices
    const [soloAnnual, proAnnual, maxAnnual] = await Promise.all([
      stripe.prices.create({
        product: products.solo,
        unit_amount: ANNUAL_AMOUNTS.solo,
        currency: 'eur',
        recurring: { interval: 'year' },
        nickname: 'Solo Annuel',
        metadata: { plan: 'solo', billing: 'annual' },
      }),
      stripe.prices.create({
        product: products.pro,
        unit_amount: ANNUAL_AMOUNTS.pro,
        currency: 'eur',
        recurring: { interval: 'year' },
        nickname: 'Pro Annuel',
        metadata: { plan: 'pro', billing: 'annual' },
      }),
      stripe.prices.create({
        product: products.max,
        unit_amount: ANNUAL_AMOUNTS.max,
        currency: 'eur',
        recurring: { interval: 'year' },
        nickname: 'Max Annuel',
        metadata: { plan: 'max', billing: 'annual' },
      }),
    ]);

    return new Response(JSON.stringify({
      STRIPE_PRICE_SOLO_ANNUAL: soloAnnual.id,
      STRIPE_PRICE_PRO_ANNUAL:  proAnnual.id,
      STRIPE_PRICE_MAX_ANNUAL:  maxAnnual.id,
      products,
    }, null, 2), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

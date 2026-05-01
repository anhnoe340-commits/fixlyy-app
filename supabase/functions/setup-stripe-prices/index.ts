import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const results: Record<string, string> = {};

    const plans = [
      { name: 'Solo', monthly: 7900, annual: 6300 },
      { name: 'Pro',  monthly: 14900, annual: 11900 },
      { name: 'Equipe', monthly: 24900, annual: 19900 },
    ];

    for (const plan of plans) {
      // Créer le produit
      const product = await stripe.products.create({
        name: `Fixlyy ${plan.name}`,
        metadata: { plan: plan.name.toLowerCase() },
      });

      // Prix mensuel
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthly,
        currency: 'eur',
        recurring: { interval: 'month' },
        nickname: `${plan.name} Mensuel`,
      });

      // Prix annuel
      const annualPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.annual,
        currency: 'eur',
        recurring: { interval: 'month' },
        nickname: `${plan.name} Annuel`,
        metadata: { billing: 'annual' },
      });

      results[`${plan.name.toLowerCase()}_monthly`] = monthlyPrice.id;
      results[`${plan.name.toLowerCase()}_annual`] = annualPrice.id;
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

const PRICE_PER_USER_CENTS = 5000; // 50€

function getVolumeDiscount(count: number): number {
  if (count >= 20) return 0.15;
  if (count >= 10) return 0.10;
  if (count >= 5)  return 0.05;
  return 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization')!;
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: cors });

  const { priceId, planId, associates_count, billing, trade, company, email } = await req.json();

  try {
    // Créer ou récupérer le customer Stripe
    const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
    const customer = existing.data[0] ?? await stripe.customers.create({
      email: user.email!,
      name: company,
      metadata: { supabase_uid: user.id, trade },
    });

    // Construire les line_items selon le plan
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];

    if (planId === 'expert') {
      // Plan Équipe : prix dynamique par utilisateur avec réduction volume
      const userCount = Math.max(2, associates_count || 2);
      const volumeDiscount = getVolumeDiscount(userCount);
      const annualDiscount = billing === 'annual' ? 0.20 : 0;
      const totalDiscount = 1 - (1 - volumeDiscount) * (1 - annualDiscount);
      const unitAmountCents = Math.round(PRICE_PER_USER_CENTS * (1 - totalDiscount));

      const discountParts = [];
      if (volumeDiscount > 0) discountParts.push(`−${Math.round(volumeDiscount * 100)}% volume`);
      if (annualDiscount > 0) discountParts.push(`−20% annuel`);
      const discountLabel = discountParts.length > 0 ? ` (${discountParts.join(', ')})` : '';

      lineItems = [{
        price_data: {
          currency: 'eur',
          unit_amount: unitAmountCents,
          recurring: { interval: 'month' },
          product_data: {
            name: `Fixlyy Équipe${discountLabel}`,
            description: `Par utilisateur/mois · ${userCount} utilisateur${userCount > 1 ? 's' : ''}`,
          },
        },
        quantity: userCount,
      }];
    } else {
      // Plans Solo et Pro : price ID fixe, quantité 1
      lineItems = [{ price: priceId, quantity: 1 }];
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: lineItems,
      metadata: {
        supabase_uid: user.id,
        company,
        trade,
        plan_id: planId,
        associates_count: String(associates_count || 1),
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_uid: user.id },
      },
      success_url: `${Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'}/?checkout=success`,
      cancel_url: `${Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'}/`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'fr',
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('Stripe error:', e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});

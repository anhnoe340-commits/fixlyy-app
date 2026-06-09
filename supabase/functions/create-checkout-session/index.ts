import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!);

const cors = { 'Access-Control-Allow-Origin': 'https://app.fixlyy.fr', 'Access-Control-Allow-Headers': 'authorization, content-type' };

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

    // Tous les plans utilisent désormais un price ID fixe (Solo 97€, Pro 197€, Max 347€)
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ];

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
    console.error('Stripe error (internal):', e.message);
    return new Response(
      JSON.stringify({ error: 'checkout_failed' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});

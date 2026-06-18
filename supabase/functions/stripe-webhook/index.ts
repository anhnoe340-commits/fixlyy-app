import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';
import { logEvent } from '../_shared/audit.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
);

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

// Source de vérité des price IDs Stripe — créés le 2026-06-09
// Overage (metered, non activé) : solo/pro price_1TgNiTBKWw2Sqpyku6QVuGor / price_1TgNiUBKWw2SqpykcRv08l7F · max price_1TgNiUBKWw2Sqpyk1QaaW9j2
const PRICE_PLAN_MAP: Record<string, { plan: string; member_limit: number }> = {
  'price_1TgNhNBKWw2SqpykxEkXTAma': { plan: 'solo', member_limit: 1 },
  'price_1TgNhOBKWw2SqpykzY7j1ood': { plan: 'pro',  member_limit: 3 },
  'price_1TgNhOBKWw2Sqpyku7Rk2ioO': { plan: 'max',  member_limit: 10 },
}

function getDefaultServicesForTrade(trade: string): { label: string; price_type: string; price_amount: number | null }[] {
  const t = trade.toLowerCase()
  const isPlombier    = t.includes('plomb')
  const isElectricien = t.includes('élect') || t.includes('elect')
  const isSerrurier   = t.includes('serrur')
  const isChauffagiste = t.includes('chauf') || t.includes('clim')
  const isMenuisier   = t.includes('menuis') || t.includes('charpen')

  const list: [string, string, number | null][] = isPlombier ? [
    ['Débouchage évier', 'fixed', 80], ['Débouchage WC', 'fixed', 90], ['Fuite robinet', 'fixed', 90],
    ['Fuite tuyauterie', 'from', 120], ['Chauffe-eau panne', 'quote', null], ['Chauffe-eau remplacement', 'from', 800],
    ["Fuite chasse d'eau", 'fixed', 85], ['Installation lavabo', 'from', 150], ['Installation douche', 'from', 400],
    ['Détartrage', 'fixed', 120], ['Recherche de fuite', 'from', 150], ['Raccordement électroménager', 'fixed', 80],
    ['Installation baignoire', 'from', 500], ["Dégât des eaux", 'quote', null], ['Urgence nuit/week-end', 'from', 150],
  ] : isElectricien ? [
    ['Panne générale', 'fixed', 90], ['Remplacement tableau électrique', 'from', 800], ['Ajout prise électrique', 'fixed', 80],
    ['Ajout interrupteur', 'fixed', 75], ['Installation luminaire', 'fixed', 85], ['Mise aux normes', 'quote', null],
    ['Diagnostic électrique', 'fixed', 90], ['Installation VMC', 'from', 300], ['Câblage cuisine', 'from', 200],
    ['Borne recharge véhicule', 'from', 900], ['Installation store électrique', 'from', 200], ['Urgence panne', 'from', 120],
    ['Révision tableau', 'fixed', 150], ['Installation portail électrique', 'from', 500], ['Domotique', 'quote', null],
  ] : isSerrurier ? [
    ['Ouverture porte claquée', 'from', 90], ['Ouverture porte blindée', 'from', 150], ['Changement serrure', 'from', 150],
    ['Installation serrure 3 points', 'from', 250], ['Reproduction clé', 'fixed', 25], ['Installation verrou', 'fixed', 80],
    ['Blindage porte', 'from', 600], ['Ouverture coffre', 'from', 200], ['Urgence nuit', 'from', 150],
    ['Installation digicode', 'from', 200], ['Installation interphone', 'from', 250], ['Remplacement cylindre', 'from', 90],
    ['Installation judas', 'fixed', 80], ['Sécurisation après effraction', 'quote', null], ['Devis sécurité', 'quote', null],
  ] : isChauffagiste ? [
    ['Panne chaudière', 'from', 90], ['Entretien chaudière', 'fixed', 120], ['Remplacement chaudière', 'from', 2000],
    ['Installation radiateur', 'from', 200], ['Purge radiateur', 'fixed', 80], ['Fuite chauffage', 'from', 100],
    ['Installation plancher chauffant', 'quote', null], ['Dépannage climatisation', 'from', 90], ['Installation climatisation', 'from', 800],
    ['Entretien climatisation', 'fixed', 100], ['Installation pompe à chaleur', 'from', 5000], ['Remplacement vanne', 'fixed', 120],
    ['Diagnostic chauffage', 'fixed', 90], ['Installation thermostat', 'from', 150], ['Urgence panne chauffage', 'from', 120],
  ] : isMenuisier ? [
    ['Pose de porte intérieure', 'from', 200], ["Pose de porte d'entrée", 'from', 400], ['Installation fenêtre', 'from', 300],
    ['Installation double vitrage', 'from', 250], ['Pose de parquet', 'from', 25], ['Pose de carrelage', 'from', 30],
    ['Installation cuisine', 'from', 1500], ['Installation dressing', 'from', 800], ['Réparation meuble', 'from', 80],
    ['Pose de volet', 'from', 200], ['Installation escalier', 'from', 2000], ['Pose de lambris', 'from', 20],
    ['Réparation porte', 'fixed', 90], ['Installation verrière', 'from', 1500], ['Devis travaux menuiserie', 'quote', null],
  ] : []

  return list.map(([label, price_type, price_amount]) => ({ label, price_type, price_amount }))
}

async function callProvision(uid: string): Promise<void> {
  const res = await fetch(`${SB_URL}/functions/v1/assign-number-from-pool`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SB_SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: uid }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`assign-number-from-pool failed: ${res.status} ${text}`)
  }
}

async function handleProvisioningFailure(uid: string, reason: string): Promise<void> {
  await supabase.from('profiles').update({ provisioning_status: 'failed' }).eq('id', uid)
  await supabase.from('critical_alerts').insert({
    alert_type: 'provisioning_failed',
    severity: 'critical',
    message: `Provisioning failed for user ${uid}: ${reason}`,
    meta: { user_id: uid, reason },
  })
  console.error(`[PROVISIONING FAILED] uid=${uid} reason=${reason}`)
}

serve(async (req) => {
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text();

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[webhook] signature check failed:', err.message)
    return new Response(JSON.stringify({ error: 'Webhook signature invalid' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.supabase_uid;
      const trade = session.metadata?.trade ?? ''

      if (uid) {
        await supabase.from('profiles').upsert({
          id: uid,
          stripe_customer_id: session.customer as string,
          ...(session.metadata?.company ? { company_name: session.metadata.company } : {}),
          ...(trade ? { company_type: trade } : {}),
        }, { onConflict: 'id', ignoreDuplicates: false })

        // Pré-remplissage des prestations par défaut selon le métier
        if (trade) {
          const defaults = getDefaultServicesForTrade(trade)
          if (defaults.length > 0) {
            const { count } = await supabase.from('service_pricing').select('id', { count: 'exact', head: true }).eq('user_id', uid)
            if (!count || count === 0) {
              await supabase.from('service_pricing').insert(
                defaults.map((d, i) => ({ ...d, user_id: uid, position: i, is_default: true }))
              )
            }
          }
        }

        callProvision(uid).catch(err => handleProvisioningFailure(uid, err.message))
      } else {
        // Payment Link sans supabase_uid → profil orphelin à réclamer via /setup
        const customerId  = session.customer as string
        const custDetails = (session as any).customer_details as Record<string, string> | null
        const email       = custDetails?.email?.trim().toLowerCase() ?? ''
        const phone       = (custDetails?.phone ?? '').replace(/\s/g, '')

        console.log(`[webhook] checkout.session.completed (Payment Link) customer=${customerId} email=${email} phone=${phone} custDetails=${JSON.stringify(custDetails)}`)

        if (!customerId) {
          console.error('[webhook] checkout: no customerId — skipping orphan insert')
        } else if (!email && !phone) {
          console.error(`[webhook] checkout: no email/phone for customer=${customerId} — skipping orphan insert`)
        } else {
          const orphanId = crypto.randomUUID()
          const { error: orphanErr } = await supabase.from('profiles').insert({
            id:                  orphanId,
            stripe_customer_id:  customerId,
            email,
            phone,
            source:              'prospection',
            provisioning_status: 'pending_claim',
          })
          if (orphanErr) {
            console.error(`[webhook] orphan insert failed customer=${customerId}: ${orphanErr.message}`)
          } else {
            console.log(`[webhook] orphan created id=${orphanId} customer=${customerId} email=${email} phone=${phone}`)
          }
        }
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status;
      const priceId = sub.items.data[0]?.price.id ?? null;
      const planMeta = priceId ? PRICE_PLAN_MAP[priceId] ?? null : null;
      const planName = planMeta?.plan ?? null;
      const memberLimit = planMeta?.member_limit ?? null;
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

      // engagement 3 mois calculé une seule fois à la création
      const commitmentEnd = event.type === 'customer.subscription.created'
        ? new Date(((sub.start_date ?? Math.floor(Date.now() / 1000))) * 1000 + 90 * 24 * 60 * 60 * 1000).toISOString()
        : undefined

      const hasLaunchDiscount = sub.discount !== null && sub.discount !== undefined;
      const billingInterval = (sub.items.data[0]?.price?.recurring?.interval === 'year') ? 'annual' : 'monthly';

      await supabase.from('subscriptions').upsert({
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        status,
        plan: planName,
        current_period_end: sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null,
        trial_end: trialEnd,
        updated_at: new Date().toISOString(),
        has_launch_discount: hasLaunchDiscount,
        billing_interval: billingInterval,
        ...(commitmentEnd ? { commitment_end: commitmentEnd } : {}),
      }, { onConflict: 'stripe_subscription_id' });

      const active = ['trialing', 'active'].includes(status);
      await supabase.from('profiles')
        .update({
          vapi_enabled: active,
          subscription_status: status,
          subscription_trial_end: trialEnd,
          subscription_plan: planName,
          ...(memberLimit !== null ? { member_limit: memberLimit } : {}),
        })
        .eq('stripe_customer_id', sub.customer as string);
      await logEvent({ supabase, eventType: 'subscription_created',
        userId: null, resourceType: 'subscription', resourceId: sub.id,
        metadata: { status, plan: planName, price_id: priceId, customer: sub.customer }, severity: 'info' });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);
      await supabase.from('profiles')
        .update({ vapi_enabled: false, subscription_status: 'canceled' })
        .eq('stripe_customer_id', sub.customer as string);
      await logEvent({ supabase, eventType: 'subscription_canceled',
        userId: null, resourceType: 'subscription', resourceId: sub.id,
        metadata: { customer: sub.customer }, severity: 'warning' });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from('profiles')
        .update({ vapi_enabled: false })
        .eq('stripe_customer_id', invoice.customer as string);
      await logEvent({ supabase, eventType: 'payment_failed',
        userId: null, resourceType: 'invoice', resourceId: invoice.id,
        metadata: { customer: invoice.customer, amount_due: invoice.amount_due }, severity: 'critical' });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from('profiles')
        .update({ vapi_enabled: true })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }

    case 'setup_intent.succeeded': {
      const si = event.data.object as Stripe.SetupIntent;
      const stripeCustomerId = si.customer as string | null;
      if (!stripeCustomerId) break;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, twilio_number, provisioning_status')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

      if (!profile) break;

      await supabase.from('profiles').update({
        payment_method_added: true,
        trial_status: 'converted',
      }).eq('id', profile.id);

      if (!profile.twilio_number || profile.provisioning_status === 'failed') {
        callProvision(profile.id).catch(err => handleProvisioningFailure(profile.id, err.message))
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

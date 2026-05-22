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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch {
    return new Response('Webhook signature invalid', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.supabase_uid;

      if (uid) {
        await supabase.from('profiles').upsert({
          id: uid,
          stripe_customer_id: session.customer as string,
          ...(session.metadata?.company ? { company_name: session.metadata.company } : {}),
          ...(session.metadata?.trade ? { company_type: session.metadata.trade } : {}),
        }, { onConflict: 'id', ignoreDuplicates: false })

        callProvision(uid).catch(err => handleProvisioningFailure(uid, err.message))
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status;
      const planName = sub.items.data[0]?.price.nickname ?? null;
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

      await supabase.from('subscriptions').upsert({
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        status,
        plan: planName,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        trial_end: trialEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

      const active = ['trialing', 'active'].includes(status);
      await supabase.from('profiles')
        .update({
          vapi_enabled: active,
          subscription_status: status,
          subscription_trial_end: trialEnd,
          subscription_plan: planName,
        })
        .eq('stripe_customer_id', sub.customer as string);
      await logEvent({ supabase, eventType: 'subscription_created',
        userId: null, resourceType: 'subscription', resourceId: sub.id,
        metadata: { status, plan: planName, customer: sub.customer }, severity: 'info' });
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

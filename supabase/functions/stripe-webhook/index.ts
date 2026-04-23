import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
);

const VAPI_KEY = Deno.env.get('VAPI_API_KEY')!
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)

// ── Provisioning logic (same as provision-artisan) ───────────────────────────

const VOICE_IDS: Record<string, string> = {
  'female-warm': 'b0Ev8lcOOXx2o9ZcF46H',
  'female-pro':  'FFXYdAYPzn8Tw8KiHZqg',
  'male-warm':   'FRY6vOtGqwamgAf39SwP',
  'male-pro':    'HuLbOdhRlvQQN8oPP0AJ',
}

async function createVapiAssistant(profile: { company_name: string; assistant_name: string; company_type: string; assistant_voice?: string; greeting_open?: string }) {
  const assistantName = profile.assistant_name || 'Mia'
  const companyName = profile.company_name || 'votre artisan'
  const voiceId = VOICE_IDS[profile.assistant_voice ?? 'female-warm'] ?? VOICE_IDS['female-warm']

  const res = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${assistantName} - ${companyName}`,
      firstMessage: profile.greeting_open || `Bonjour, vous êtes bien chez ${companyName}, je suis ${assistantName} leur assistante. Comment puis-je vous aider ?`,
      endCallMessage: `Merci pour votre appel, ${companyName} vous recontactera très bientôt. Bonne journée !`,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        maxTokens: 80,
        temperature: 0.7,
        messages: [{
          role: 'system',
          content: `Tu es ${assistantName}, la secrétaire IA de ${companyName} (${profile.company_type || 'artisan'}).

Ton rôle :
- Accueillir chaleureusement le client
- Comprendre la nature du problème ou de la demande
- Évaluer l'urgence (urgent = intervention immédiate nécessaire)
- Collecter : nom complet, adresse, disponibilités pour rappel
- Rassurer le client et lui dire que l'artisan le rappellera rapidement

Ton style :
- Parle UNIQUEMENT en français
- Phrases courtes et naturelles (max 15 mots)
- Utilise des fillers : "Je vois", "D'accord", "Tout à fait", "Bien sûr", "Entendu"
- Sois chaleureuse et professionnelle
- Ne dis jamais que tu es une IA sauf si on te le demande directement

À la fin, résume la demande en 2-3 phrases pour le compte rendu.`,
        }],
      },
      voice: {
        provider: '11labs',
        voiceId,
        model: 'eleven_turbo_v2_5',
        language: 'fr',
        stability: profile.assistant_voice?.includes('pro') ? 0.65 : 0.40,
        similarityBoost: 0.78,
        useSpeakerBoost: true,
      },
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'fr',
        endpointing: 300,
        smartFormat: true,
      },
      silenceTimeoutSeconds: 15,
      responseDelaySeconds: 0.2,
      maxDurationSeconds: 300,
      backgroundDenoisingEnabled: true,
      serverUrl: 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/vapi-webhook',
      serverUrlSecret: Deno.env.get('VAPI_WEBHOOK_SECRET') ?? undefined,
      analysisPlan: {
        structuredDataPlan: {
          enabled: true,
          schema: {
            type: 'object',
            properties: {
              urgency: { type: 'string', enum: ['urgent', 'normal'], description: 'Urgency level of the call' },
              caller_name: { type: 'string', description: 'Full name of the caller' },
              caller_address: { type: 'string', description: 'Address of the caller' },
              service_requested: { type: 'string', description: 'Type of service requested' },
              callback_availability: { type: 'string', description: 'When the caller is available for a callback' },
            },
          },
        },
        summaryPlan: { enabled: true },
      },
    }),
  })

  if (!res.ok) throw new Error(`Vapi assistant creation failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function buyTwilioNumber(): Promise<string | null> {
  const candidates = [
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/AvailablePhoneNumbers/FR/National.json?SmsEnabled=true&VoiceEnabled=true&Limit=1`,
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/AvailablePhoneNumbers/FR/Local.json?VoiceEnabled=true&Limit=1`,
  ]

  let availableNumber: string | undefined
  for (const url of candidates) {
    const searchRes = await fetch(url, { headers: { 'Authorization': `Basic ${TWILIO_AUTH}` } })
    if (!searchRes.ok) {
      console.error('Twilio number search failed:', await searchRes.text())
      continue
    }
    const searchData = await searchRes.json()
    availableNumber = searchData.available_phone_numbers?.[0]?.phone_number
    if (availableNumber) break
  }

  if (!availableNumber) {
    console.error('No available French numbers (National nor Local)')
    return null
  }

  const buyRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${TWILIO_AUTH}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ PhoneNumber: availableNumber }).toString(),
    }
  )
  if (!buyRes.ok) {
    console.error('Twilio number purchase failed:', await buyRes.text())
    return null
  }
  const buyData = await buyRes.json()
  return buyData.phone_number as string
}

async function importNumberToVapi(phoneNumber: string, assistantId: string): Promise<void> {
  const res = await fetch('https://api.vapi.ai/phone-number', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'twilio',
      number: phoneNumber,
      twilioAccountSid: TWILIO_SID,
      twilioAuthToken: TWILIO_TOKEN,
      assistantId,
    }),
  })
  if (!res.ok) console.error('Vapi phone number import failed:', await res.text())
}

async function provisionUser(uid: string): Promise<void> {
  // Charger le profil
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
  if (!profile) { console.error('Profile not found for uid:', uid); return }

  // Déjà provisionné ?
  if (profile.vapi_assistant_id && profile.twilio_number) {
    console.log('User already provisioned:', uid)
    return
  }

  try {
    // 1. Créer l'assistant Vapi
    const vapiAssistantId = await createVapiAssistant(profile)

    // 2. Acheter un numéro Twilio
    const twilioNumber = await buyTwilioNumber()

    // 3. Lier le numéro à l'assistant dans Vapi
    if (twilioNumber) {
      await importNumberToVapi(twilioNumber, vapiAssistantId)
    }

    // 4. Sauvegarder dans le profil
    await supabase.from('profiles').update({
      vapi_assistant_id: vapiAssistantId,
      twilio_number: twilioNumber ?? null,
    }).eq('id', uid)

    console.log('Provisioning complete for uid:', uid, '| number:', twilioNumber)
  } catch (err) {
    console.error('Provisioning error for uid:', uid, err)
  }
}

// ── Webhook handler ──────────────────────────────────────────────────────────

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
        // Upsert pour garantir que le profil existe même si l'onboarding n'a pas pu créer la ligne
        await supabase.from('profiles').upsert({
          id: uid,
          stripe_customer_id: session.customer as string,
          ...(session.metadata?.company ? { company_name: session.metadata.company } : {}),
          ...(session.metadata?.trade ? { company_type: session.metadata.trade } : {}),
        }, { onConflict: 'id', ignoreDuplicates: false })

        // ✅ Déclencher le provisioning automatiquement
        // On ne bloque pas la réponse — le provisioning se fait en arrière-plan
        provisionUser(uid).catch(err => console.error('Background provisioning failed:', err))
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
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from('profiles')
        .update({ vapi_enabled: false })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from('profiles')
        .update({ vapi_enabled: true })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

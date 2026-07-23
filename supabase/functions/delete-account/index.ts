import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY    = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY   = Deno.env.get('STRIPE_SECRET_KEY')!
const VAPI_API_KEY        = Deno.env.get('VAPI_API_KEY')!
const TWILIO_ACCOUNT_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN')!

// Numéro principal Fixlyy — ne jamais libérer
const FIXLYY_MAIN_NUMBER = '+33939247033'

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS })
  }

  // ── POST uniquement ─────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // ── Authentification JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Non authentifié' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
  const token = authHeader.replace('Bearer ', '')

  // Validation du token via le service role (getUser valide le JWT)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Token invalide ou expiré' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // user_id extrait du JWT UNIQUEMENT — jamais depuis le body
  const user_id = user.id

  // ── Confirmation explicite ──────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vide = 400 ci-dessous */ }

  if (body?.confirm !== 'DELETE MY ACCOUNT') {
    return new Response(
      JSON.stringify({
        error: 'Confirmation requise',
        hint: 'Envoyez { "confirm": "DELETE MY ACCOUNT" }',
      }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // ── Récupérer le profil complet ─────────────────────────────────────────────
  // email vient de auth.users (user.email déjà disponible depuis le JWT)
  // stripe_customer_id / stripe_subscription_id sont dans la table subscriptions
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, vapi_assistant_id, twilio_number, phone, company_name')
    .eq('id', user_id)
    .single()

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profil introuvable' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // Abonnement Stripe — champs dans la table subscriptions
  const { data: subData } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('user_id', user_id)
    .maybeSingle()

  // ── ÉTAPE 1 — LOG AUDIT INITIAL (avant toute suppression) ──────────────────
  await logEvent({
    supabase: supabaseAdmin,
    eventType: 'account_deletion_initiated',
    userId: user_id,
    resourceType: 'account',
    resourceId: user_id,
    metadata: {
      email:              user.email,
      company_name:       profile.company_name,
      stripe_customer_id: subData?.stripe_customer_id,
      vapi_assistant_id:  profile.vapi_assistant_id,
      twilio_number:      profile.twilio_number,
      initiated_at:       new Date().toISOString(),
    },
    severity: 'warning',
  })

  const results = {
    stripe_deleted:   false,
    vapi_deleted:     false,
    twilio_released:  false,
  }

  // ── ÉTAPE 2 — STRIPE ────────────────────────────────────────────────────────
  // En cas d'erreur Stripe : logger et CONTINUER (suppression des données prime)
  const stripeAuth = 'Basic ' + btoa(STRIPE_SECRET_KEY + ':')

  if (subData?.stripe_subscription_id) {
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subData.stripe_subscription_id}`,
        { method: 'DELETE', headers: { Authorization: stripeAuth } },
      )
      if (!res.ok) {
        const err = await res.json()
        console.error('[delete-account] Stripe subscription failed:', JSON.stringify(err))
      }
    } catch (e) {
      console.error('[delete-account] Stripe subscription error:', e)
    }
  }

  if (subData?.stripe_customer_id) {
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/customers/${subData.stripe_customer_id}`,
        { method: 'DELETE', headers: { Authorization: stripeAuth } },
      )
      if (res.ok) {
        results.stripe_deleted = true
      } else {
        const err = await res.json()
        console.error('[delete-account] Stripe customer failed:', JSON.stringify(err))
      }
    } catch (e) {
      console.error('[delete-account] Stripe customer error:', e)
    }
  } else {
    results.stripe_deleted = true
  }

  // ── ÉTAPE 3 — VAPI ──────────────────────────────────────────────────────────
  if (profile.vapi_assistant_id) {
    try {
      const res = await fetch(
        `https://api.vapi.ai/assistant/${profile.vapi_assistant_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${VAPI_API_KEY}` } },
      )
      if (res.ok) {
        results.vapi_deleted = true
      } else {
        console.error('[delete-account] Vapi delete failed:', res.status)
      }
    } catch (e) {
      console.error('[delete-account] Vapi error:', e)
    }
  } else {
    results.vapi_deleted = true
  }

  // ── ÉTAPE 4 — LIBÉRER le numéro dans le pool (P0 fix) ──────────────────────
  // BUG corrigé : l'ancienne version faisait DELETE sur Twilio → numéro
  // définitivement perdu, impossible à réassigner à un prochain artisan.
  // Comportement correct :
  //   a) PATCH Twilio VoiceUrl="" → désassigner Vapi du numéro
  //   b) PATCH Vapi assistantId=null → jamais DELETE sur le mapping (CLAUDE.md)
  //   c) Pool status='available', assigned_to_user_id=null
  if (profile.twilio_number && profile.twilio_number !== FIXLYY_MAIN_NUMBER) {
    const twilioAuth = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    try {
      // Récupérer twilio_sid et vapi_phone_number_id depuis le pool
      const { data: poolRow } = await supabaseAdmin
        .from('phone_numbers_pool')
        .select('twilio_sid, vapi_phone_number_id')
        .eq('phone_number', profile.twilio_number)
        .maybeSingle()

      // a. PATCH Twilio : effacer VoiceUrl → le numéro reste dans le compte Twilio
      if (poolRow?.twilio_sid) {
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${poolRow.twilio_sid}.json`,
          {
            method: 'POST',
            headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ VoiceUrl: '', VoiceMethod: 'POST' }),
          },
        )
        if (!twilioRes.ok) {
          console.error('[delete-account] Twilio PATCH failed:', twilioRes.status)
        }
      }

      // b. PATCH Vapi : désassigner l'assistant du numéro (jamais DELETE — règle CLAUDE.md)
      if (poolRow?.vapi_phone_number_id) {
        await fetch(`https://api.vapi.ai/phone-number/${poolRow.vapi_phone_number_id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistantId: null,
            twilioAccountSid: TWILIO_ACCOUNT_SID,
            twilioAuthToken: TWILIO_AUTH_TOKEN,
          }),
        }).catch(e => console.error('[delete-account] Vapi PATCH error:', e))
      }

      // c. Remettre le numéro disponible dans le pool
      // INVARIANT : on ne touche que les lignes status='assigned' — les numéros
      // en 'quarantine' doivent rester en quarantine même si un utilisateur leur
      // était encore associé (assigned_to_user_id non nul).
      const { error: poolErr } = await supabaseAdmin
        .from('phone_numbers_pool')
        .update({ status: 'available', assigned_to_user_id: null, assigned_at: null })
        .eq('phone_number', profile.twilio_number)
        .eq('status', 'assigned')
      if (poolErr) {
        console.error('[delete-account] pool update failed — numéro bloqué:', poolErr.message)
      } else {
        results.twilio_released = true
      }
    } catch (e) {
      console.error('[delete-account] release error:', e)
    }
  } else {
    results.twilio_released = true
  }

  // ── ÉTAPE 5 — SUPABASE DATA (ordre respect foreign keys) ────────────────────
  // Si une suppression échoue → ARRÊTER et retourner 500
  const deletionSteps: { table: string; column: string }[] = [
    { table: 'sms_conversations', column: 'artisan_id' },
    { table: 'calls',             column: 'artisan_id' },
    { table: 'appointments',      column: 'artisan_id' },
    { table: 'contacts',          column: 'user_id'    },
    { table: 'inbound_reasons',   column: 'user_id'    },
    { table: 'outbound_reasons',  column: 'user_id'    },
    { table: 'user_webhooks',     column: 'user_id'    },
    { table: 'subscriptions',     column: 'user_id'    },
  ]

  for (const step of deletionSteps) {
    const { error } = await supabaseAdmin
      .from(step.table)
      .delete()
      .eq(step.column, user_id)
    // Ignorer "relation does not exist" (table optionnelle selon l'état du compte)
    if (error && !error.message.includes('does not exist')) {
      console.error(`[delete-account] delete_${step.table} error:`, error.message)
      return new Response(
        JSON.stringify({ success: false, step: `delete_${step.table}`, error: 'Une erreur est survenue' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }
  }

  const { error: profileDeleteError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', user_id)

  if (profileDeleteError) {
    console.error('[delete-account] delete_profiles error:', profileDeleteError.message)
    return new Response(
      JSON.stringify({ success: false, step: 'delete_profiles', error: 'Une erreur est survenue' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // ── ÉTAPE 6 — AUTH (en dernier, après suppression des données) ───────────────
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
  if (authDeleteError) {
    console.error('[delete-account] delete_auth error:', authDeleteError.message)
    return new Response(
      JSON.stringify({ success: false, step: 'delete_auth', error: 'Une erreur est survenue' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // ── ÉTAPE 7 — LOG AUDIT FINAL ───────────────────────────────────────────────
  // user_id passé à null : l'utilisateur n'existe plus dans auth.users,
  // la FK rejetterait l'insert. L'ID est conservé dans resource_id + metadata.
  await logEvent({
    supabase: supabaseAdmin,
    eventType: 'account_deletion_completed',
    userId: null,
    resourceType: 'account',
    resourceId: user_id,
    metadata: {
      deleted_user_id:  user_id,
      completed_at:     new Date().toISOString(),
      stripe_deleted:   results.stripe_deleted,
      vapi_deleted:     results.vapi_deleted,
      twilio_released:  results.twilio_released,
      supabase_deleted: true,
    },
    severity: 'critical',
  })

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Compte supprimé conformément au RGPD',
      details: {
        stripe_deleted:  results.stripe_deleted,
        vapi_deleted:    results.vapi_deleted,
        twilio_released: results.twilio_released,
        data_deleted:    true,
      },
    }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})

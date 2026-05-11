// Gère les 3 crons trial : J+5 reminder, J+7 expire, J+14 cleanup
// POST body: { action: 'remind' | 'expire' | 'cleanup' }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL       = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM  = Deno.env.get('TWILIO_PHONE_NUMBER')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')!
const VAPI_KEY     = Deno.env.get('VAPI_API_KEY')!
const APP_URL      = Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'
const CRON_SECRET  = Deno.env.get('CRON_SECRET')!

const sb = createClient(SB_URL, SB_SERVICE)

async function sendSms(to: string, body: string) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  })
  return res.ok
}

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Fixlyy <noreply@fixlyy.fr>', to, subject, html }),
  })
}

async function deleteVapiMapping(vapiPhoneNumberId: string) {
  if (!vapiPhoneNumberId) return
  await fetch(`https://api.vapi.ai/phone-number/${vapiPhoneNumberId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  })
}

// H : J+5 — SMS + email de rappel pour les essais actifs sans CB
async function handleRemind() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString()
  const sixDaysAgo  = new Date(Date.now() - 6 * 86400000).toISOString()

  const { data: users } = await sb
    .from('profiles')
    .select('id, phone, full_name, resume_token')
    .eq('trial_status', 'active')
    .eq('payment_method_added', false)
    .is('reminder_sent_at', null)
    .gte('trial_ends_at', fiveDaysAgo) // essai pas encore expiré
    .lte('trial_ends_at', new Date(Date.now() + 3 * 86400000).toISOString()) // expire dans <=3j

  if (!users?.length) return { reminded: 0 }

  let reminded = 0
  for (const u of users) {
    const firstName = (u.full_name || '').split(' ')[0] || 'vous'
    const resumeLink = u.resume_token ? `${APP_URL}/r/${u.resume_token}` : APP_URL

    if (u.phone) {
      await sendSms(u.phone,
        `[Fixlyy] ${firstName}, votre essai gratuit se termine dans 2 jours.\n` +
        `Ajoutez votre carte pour garder votre numero Mia.\n${resumeLink}`
      )
    }

    await sb.from('profiles').update({ reminder_sent_at: new Date().toISOString() }).eq('id', u.id)
    reminded++
  }
  return { reminded }
}

// I : J+7 — expire les essais, désactive le numéro Vapi (status='expired')
async function handleExpire() {
  const now = new Date().toISOString()

  const { data: users } = await sb
    .from('profiles')
    .select('id, phone, full_name')
    .eq('trial_status', 'active')
    .eq('payment_method_added', false)
    .lt('trial_ends_at', now)

  if (!users?.length) return { expired: 0 }

  let expired = 0
  for (const u of users) {
    // Trouve le numéro assigné
    const { data: poolRow } = await sb
      .from('phone_numbers_pool')
      .select('id, vapi_phone_number_id')
      .eq('assigned_to_user_id', u.id)
      .eq('status', 'assigned')
      .maybeSingle()

    if (poolRow?.vapi_phone_number_id) {
      await deleteVapiMapping(poolRow.vapi_phone_number_id)
      await sb.from('phone_numbers_pool')
        .update({ status: 'expired', vapi_phone_number_id: null })
        .eq('id', poolRow.id)
    }

    await sb.from('profiles').update({
      trial_status: 'expired',
      vapi_assistant_id: null,
    }).eq('id', u.id)

    const firstName = (u.full_name || '').split(' ')[0] || 'vous'
    if (u.phone) {
      await sendSms(u.phone,
        `[Fixlyy] ${firstName}, votre essai est termine. Mia ne repond plus vos appels.\n` +
        `Reactivez sur ${APP_URL}`
      )
    }
    expired++
  }
  return { expired }
}

// J : J+14 — si toujours impayé, libère le numéro dans le pool
async function handleCleanup() {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  const { data: users } = await sb
    .from('profiles')
    .select('id')
    .eq('trial_status', 'expired')
    .eq('payment_method_added', false)
    .lt('trial_ends_at', fourteenDaysAgo)

  if (!users?.length) return { cleaned: 0 }

  let cleaned = 0
  for (const u of users) {
    await sb.from('phone_numbers_pool')
      .update({
        status: 'available',
        assigned_to_user_id: null,
        assigned_at: null,
        released_at: new Date().toISOString(),
        vapi_phone_number_id: null,
      })
      .eq('assigned_to_user_id', u.id)
      .eq('status', 'expired')

    await sb.from('profiles').update({ twilio_number: null }).eq('id', u.id)
    cleaned++
  }
  return { cleaned }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('Unauthorized', { status: 401 })

  const startMs = Date.now()
  const { action } = await req.json().catch(() => ({}))

  try {
    let result: object
    if (action === 'remind')  result = await handleRemind()
    else if (action === 'expire')  result = await handleExpire()
    else if (action === 'cleanup') result = await handleCleanup()
    else return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400 })

    await sb.from('edge_function_logs').insert({
      function_name: `trial-lifecycle/${action}`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      input_meta: { action },
      output_meta: result,
    })

    return new Response(JSON.stringify(result), { status: 200 })
  } catch (err: any) {
    await sb.from('edge_function_logs').insert({
      function_name: `trial-lifecycle/${action}`,
      status: 'error',
      duration_ms: Date.now() - startMs,
      input_meta: { action },
      output_meta: {},
      error_message: err.message,
    })
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

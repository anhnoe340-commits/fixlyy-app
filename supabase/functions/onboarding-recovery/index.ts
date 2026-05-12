import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')!
const APP_URL     = Deno.env.get('APP_URL') || 'https://fixlyy.fr'
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const sb = createClient(SB_URL, SB_SERVICE)

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    }
  )
  if (!res.ok) console.error('SMS error:', await res.text())
  return res.ok
}

async function handleScenarioB(): Promise<number> {
  // Abandon post-OTP : compte créé il y a 15 min–24h, étape < 2, pas encore relancé
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, phone, full_name, resume_token')
    .lt('onboarding_step', 2)
    .eq('onboarding_completed', false)
    .is('recovery_sms_b_sent_at', null)
    .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  let sent = 0
  for (const p of profiles || []) {
    if (!p.phone) continue
    const resumeUrl = p.resume_token ? `${APP_URL}/r/${p.resume_token}` : APP_URL
    const ok = await sendSms(
      p.phone,
      `Vous avez commence votre inscription Fixlyy. Reprenez ou vous en etiez : ${resumeUrl}`
    )
    if (ok) {
      await sb.from('profiles').update({ recovery_sms_b_sent_at: new Date().toISOString() }).eq('id', p.id)
      sent++
    }
  }
  return sent
}

async function handleScenarioC(): Promise<number> {
  // Numéro attribué mais renvoi non activé : assigned il y a 2h–24h
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, phone, full_name, twilio_number, resume_token')
    .eq('forwarding_activated', false)
    .eq('onboarding_completed', false)
    .is('recovery_sms_c_sent_at', null)
    .not('twilio_number', 'is', null)

  // Filtrer par assigned_at via phone_numbers_pool
  const now = Date.now()
  let sent = 0
  for (const p of profiles || []) {
    if (!p.phone || !p.twilio_number) continue

    // Récupérer assigned_at depuis le pool
    const { data: poolRow } = await sb
      .from('phone_numbers_pool')
      .select('assigned_at')
      .eq('phone_number', p.twilio_number)
      .maybeSingle()

    if (!poolRow?.assigned_at) continue
    const assignedMs = new Date(poolRow.assigned_at).getTime()
    const hoursElapsed = (now - assignedMs) / (1000 * 60 * 60)
    if (hoursElapsed < 2 || hoursElapsed > 24) continue

    const numero = formatFrPhone(p.twilio_number)
    const resumeUrl = p.resume_token ? `${APP_URL}/r/${p.resume_token}` : APP_URL
    const ok = await sendSms(
      p.phone,
      `Votre numero Fixlyy ${numero} vous attend. Finalisez votre activation en 1 minute : ${resumeUrl}`
    )
    if (ok) {
      await sb.from('profiles').update({ recovery_sms_c_sent_at: new Date().toISOString() }).eq('id', p.id)
      sent++
    }
  }
  return sent
}

async function handleScenarioD(): Promise<number> {
  // Dernier rappel : créé il y a 24h–48h, onboarding non terminé
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, phone, resume_token')
    .eq('onboarding_completed', false)
    .is('recovery_sms_d_sent_at', null)
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .gt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

  let sent = 0
  for (const p of profiles || []) {
    if (!p.phone) continue
    const resumeUrl = p.resume_token ? `${APP_URL}/r/${p.resume_token}` : APP_URL
    const ok = await sendSms(
      p.phone,
      `Dernier rappel : votre essai gratuit Fixlyy vous attend. ${resumeUrl}`
    )
    if (ok) {
      await sb.from('profiles').update({ recovery_sms_d_sent_at: new Date().toISOString() }).eq('id', p.id)
      sent++
    }
  }
  return sent
}

Deno.serve(async (req) => {
  // Auth cron secret
  const secret = req.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const [b, c, d] = await Promise.all([
      handleScenarioB(),
      handleScenarioC(),
      handleScenarioD(),
    ])

    console.log(`onboarding-recovery: B=${b} C=${c} D=${d}`)
    return new Response(JSON.stringify({ ok: true, sent: { b, c, d } }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('onboarding-recovery error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

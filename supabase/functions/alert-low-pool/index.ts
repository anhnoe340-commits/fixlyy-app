// Cron 6h : alerte SMS + critique si pool bas
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_SID    = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM   = Deno.env.get('TWILIO_PHONE_NUMBER')!
const ALERT_PHONE   = Deno.env.get('ALERT_PHONE')!
const SB_URL        = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET')!

const sb = createClient(SB_URL, SB_SERVICE)

async function sendSms(to: string, body: string) {
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('Unauthorized', { status: 401 })

  const startMs = Date.now()

  const { count } = await sb
    .from('phone_numbers_pool')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'available')

  const available = count ?? 0

  if (available >= 3) {
    await sb.from('edge_function_logs').insert({
      function_name: 'alert-low-pool',
      status: 'skipped',
      duration_ms: Date.now() - startMs,
      input_meta: {},
      output_meta: { available },
    })
    return new Response(JSON.stringify({ skipped: true, available }), { status: 200 })
  }

  const isCritical = available < 1
  const severity = isCritical ? 'critical' : 'high'
  const message = isCritical
    ? `🚨 CRITIQUE : pool Fixlyy VIDE (0 numeros dispo). Achat urgent requis.`
    : `⚠️ Pool Fixlyy bas : seulement ${available} numero(s) disponible(s). Verifiez le cron replenish.`

  // Insère dans critical_alerts
  await sb.from('critical_alerts').insert({
    alert_type: isCritical ? 'pool_empty' : 'pool_low',
    severity,
    message,
    meta: { available },
  })

  // SMS vers ALERT_PHONE
  try {
    await sendSms(ALERT_PHONE, `[Fixlyy] ${message}`)
  } catch {
    // Non bloquant
  }

  await sb.from('edge_function_logs').insert({
    function_name: 'alert-low-pool',
    status: 'success',
    duration_ms: Date.now() - startMs,
    input_meta: {},
    output_meta: { available, severity, alerted: true },
  })

  return new Response(JSON.stringify({ alerted: true, available, severity }), { status: 200 })
})

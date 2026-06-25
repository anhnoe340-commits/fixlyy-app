import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase    = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+33939245471'
const APP_URL     = Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret' }

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

async function sendTrophySms(profile: {
  id: string
  phone: string
  full_name: string | null
  twilio_number: string | null
}): Promise<boolean> {
  const prenom = profile.full_name?.split(' ')[0] || 'Artisan'
  const numeroFixlyy = profile.twilio_number ? formatFrPhone(profile.twilio_number) : null

  const smsBody = numeroFixlyy
    ? `Bravo ${prenom}, Mia est prete !\nVotre numero Fixlyy : ${numeroFixlyy}\nDashboard : ${APP_URL}`
    : `Bravo ${prenom}, Mia est prete !\nDashboard : ${APP_URL}`

  const auth2 = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth2}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: TWILIO_FROM, To: profile.phone, Body: smsBody }).toString(),
    }
  )

  if (twilioRes.ok) {
    await supabase
      .from('profiles')
      .update({ trophy_sms_sent_at: new Date().toISOString() })
      .eq('id', profile.id)
  } else {
    console.error(`Twilio trophy SMS error for ${profile.id}:`, await twilioRes.text())
  }

  return twilioRes.ok
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Auth : x-cron-secret (cron + appels serveur-to-serveur depuis trigger-test-call)
  const secret = req.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { user_id?: string; mode?: string }

    // ── Mode recovery : filet de secours toutes les heures ───────────────────
    if (body.mode === 'recovery') {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone, full_name, twilio_number')
        .eq('onboarding_completed', true)
        .is('trophy_sms_sent_at', null)
        .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      let sent = 0
      for (const p of profiles || []) {
        if (!p.phone) continue
        const ok = await sendTrophySms(p)
        if (ok) sent++
      }

      await supabase.from('edge_function_logs').insert({
        function_name: 'send-welcome-sms',
        status: 'success',
        output_meta: { mode: 'recovery', sent, total: profiles?.length ?? 0 },
      })

      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Mode direct : un user_id spécifique (depuis trigger-test-call) ───────
    if (!body.user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone, full_name, twilio_number')
      .eq('id', body.user_id)
      .single()

    if (!profile?.phone) {
      return new Response(JSON.stringify({ error: 'Profil manquant' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const ok = await sendTrophySms(profile)

    await supabase.from('edge_function_logs').insert({
      function_name: 'send-welcome-sms',
      status: ok ? 'success' : 'error',
      input_meta: { user_id: body.user_id },
      output_meta: { sent: ok },
    })

    return new Response(JSON.stringify({ ok }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('send-welcome-sms error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

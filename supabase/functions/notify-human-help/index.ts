import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+33939245471'
const ALERT_PHONE = Deno.env.get('ALERT_PHONE')! // numéro de Noé
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'
const cors = { 'Access-Control-Allow-Origin': 'https://app.fixlyy.fr', 'Access-Control-Allow-Headers': 'authorization, content-type' }

function isBusinessHours(): boolean {
  const now = new Date()
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const day = paris.getDay()
  const hour = paris.getHours()
  return day >= 1 && day <= 5 && hour >= 9 && hour < 19
}

async function sendSms(to: string, body: string) {
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: TWILIO_FROM, To: to, Body: body }).toString(),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const ip = getClientIp(req)
  if (!checkRateLimit(ip, 'notify-human-help', 5, 60_000)) return TOO_MANY_REQUESTS(cors)

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response('Unauthorized', { status: 401 })

    const jwt = auth.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone, company_type, human_help_requested_at')
      .eq('id', user.id)
      .single()

    // Anti-spam : une seule demande par utilisateur
    if (profile?.human_help_requested_at) {
      return new Response(JSON.stringify({ ok: true, already_sent: true }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const inHours = isBusinessHours()
    const hoursTag = inHours ? '' : '[HORS HEURES OUVRÉES] '
    const adminUrl = `${APP_URL}/admin/users/${user.id}`

    // SMS à Noé
    if (ALERT_PHONE) {
      const smsBody = `${hoursTag}Artisan en galère onboarding : ${profile?.full_name || 'Inconnu'} - ${profile?.company_type || '?'} - ${profile?.phone || '?'} - ${adminUrl}`
      await sendSms(ALERT_PHONE, smsBody)
    }

    // Email support
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Fixlyy Alertes <alertes@fixlyy.fr>',
          to: 'support@fixlyy.fr',
          subject: `${hoursTag}Aide onboarding demandée — ${profile?.full_name || user.id}`,
          html: `
            <h2>Artisan en difficulté lors de l'onboarding</h2>
            <table>
              <tr><td><strong>Nom</strong></td><td>${profile?.full_name || '—'}</td></tr>
              <tr><td><strong>Téléphone</strong></td><td>${profile?.phone || '—'}</td></tr>
              <tr><td><strong>Métier</strong></td><td>${profile?.company_type || '—'}</td></tr>
              <tr><td><strong>User ID</strong></td><td>${user.id}</td></tr>
              <tr><td><strong>Heure demande</strong></td><td>${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</td></tr>
            </table>
            <p><a href="${adminUrl}">Voir le profil</a></p>
            ${!inHours ? '<p><strong>⚠️ Demande reçue hors heures ouvrées</strong> — rappel dès demain 9h</p>' : ''}
          `,
        }),
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('notify-human-help error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

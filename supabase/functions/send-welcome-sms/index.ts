import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+33939245471'
const APP_URL = Deno.env.get('APP_URL') || 'https://fixlyy.fr'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response('Unauthorized', { status: 401 })

    const jwt = auth.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone, full_name, twilio_number, resume_token')
      .eq('id', user.id)
      .single()

    if (!profile?.phone) {
      return new Response(JSON.stringify({ error: 'Profil manquant' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const prenom = profile.full_name?.split(' ')[0] || 'Artisan'
    const numeroMia = profile.twilio_number ? formatFrPhone(profile.twilio_number) : 'En cours d\'attribution'
    const resumeUrl = profile.resume_token ? `${APP_URL}/r/${profile.resume_token}` : APP_URL

    const smsBody = `Bienvenue chez Fixlyy, ${prenom} !\nVotre numero Mia : ${numeroMia}\nReprenez ici : ${resumeUrl}\nEssai gratuit 7 jours, sans CB.`

    const auth2 = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth2}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: TWILIO_FROM, To: profile.phone, Body: smsBody }).toString(),
    })

    if (!twilioRes.ok) {
      const err = await twilioRes.text()
      console.error('Twilio welcome SMS error:', err)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('send-welcome-sms error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

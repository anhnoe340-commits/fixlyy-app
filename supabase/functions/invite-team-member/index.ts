import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)
const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH  = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
const APP_URL      = 'https://app.fixlyy.fr'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function normalizePhone(p: string): string {
  const digits = p.replace(/[\s\-\.\(\)]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return '+33' + digits.slice(1)
  return '+33' + digits
}

async function sendSms(from: string, to: string, body: string) {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${TWILIO_AUTH}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    }
  )
  if (!res.ok) throw new Error((await res.json()).message || 'SMS failed')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name, twilio_number')
    .eq('id', user.id)
    .single()

  if (!profile?.twilio_number) {
    return new Response(JSON.stringify({ error: 'Numéro Twilio non configuré.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let body: { first_name: string; phone: string; suggested_skills?: string[] }
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { first_name, phone, suggested_skills = [] } = body
  if (!first_name?.trim() || !phone?.trim()) {
    return new Response(JSON.stringify({ error: 'Prénom et téléphone requis.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const normalizedPhone = normalizePhone(phone)

  // Vérifier qu'il n'y a pas déjà une invitation pending pour ce numéro
  const { data: existing } = await supabase
    .from('team_invitations')
    .select('id')
    .eq('owner_id', user.id)
    .eq('phone', normalizedPhone)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({ error: 'Une invitation est déjà en attente pour ce numéro.' }), {
      status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Créer l'invitation (token auto-généré par la DB)
  const { data: invitation, error: insertError } = await supabase
    .from('team_invitations')
    .insert({
      owner_id: user.id,
      first_name: first_name.trim(),
      phone: normalizedPhone,
      suggested_skills,
    })
    .select('id, token, first_name, phone, expires_at')
    .single()

  if (insertError || !invitation) {
    console.error('Insert error:', insertError)
    return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'invitation.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Envoyer le SMS
  const companyName = profile.company_name || 'votre artisan'
  const smsBody = [
    `Bonjour ${invitation.first_name}, ${companyName} vous a ajouté à son équipe Fixlyy.`,
    ``,
    `Pour activer votre profil et recevoir vos appels qualifiés, complétez votre profil ici (90s) :`,
    `${APP_URL}/join/${invitation.token}`,
    ``,
    `— Mia · Fixlyy`,
  ].join('\n')

  try {
    await sendSms(profile.twilio_number, normalizedPhone, smsBody)
  } catch (e: any) {
    console.error('SMS send failed:', e.message)
    // L'invitation est créée même si le SMS échoue — le patron peut renvoyer
  }

  return new Response(JSON.stringify({ ok: true, invitation }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Domaine SIP LiveKit Cloud — fixe par projet LiveKit
const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') ?? 'asfuzlk4elq.sip.livekit.cloud'
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)

  // Validation : le AccountSid doit correspondre à notre compte Twilio
  const accountSid = params.get('AccountSid') ?? ''
  if (TWILIO_ACCOUNT_SID && accountSid !== TWILIO_ACCOUNT_SID) {
    console.warn(`[twilio-sip-router] AccountSid invalide: ${accountSid}`)
    return new Response('Forbidden', { status: 403 })
  }

  // Numéro appelé (numéro de l'artisan)
  const to = params.get('To') ?? ''
  if (!to) {
    return new Response('Bad Request: missing To', { status: 400 })
  }

  // Normalisation E.164 — Twilio envoie +33XXXXXXXXX
  const normalized = to.startsWith('+') ? to : `+${to.replace(/^00/, '')}`

  const sipUri = `sip:${normalized}@${LIVEKIT_SIP_DOMAIN}`
  // <Connect><Sip> n'est pas disponible sur tous les comptes Twilio — <Dial><Sip> est le TwiML standard
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Sip>${sipUri}</Sip></Dial></Response>`

  console.log(`[twilio-sip-router] ${normalized} → ${sipUri}`)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
})

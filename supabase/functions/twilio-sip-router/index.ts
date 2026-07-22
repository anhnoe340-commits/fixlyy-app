const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') ?? 'asfuzlk4elq.sip.livekit.cloud'
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
// URL canonique pour la validation HMAC Twilio.
// req.url derrière le proxy Supabase peut différer de l'URL signée par Twilio
// (ex: http:// vs https://, ou path normalization).
// Si absent → validation HMAC désactivée (AccountSid check maintenu).
const TWILIO_WEBHOOK_URL = Deno.env.get('TWILIO_WEBHOOK_URL') ?? ''

async function validateTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
): Promise<boolean> {
  if (!signature) return false
  const sorted = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join('')
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(url + sorted))
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return computed === signature
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': 'https://app.fixlyy.fr' } })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)

  // Validation AccountSid (niveau 1)
  const accountSid = params.get('AccountSid') ?? ''
  if (TWILIO_ACCOUNT_SID && accountSid !== TWILIO_ACCOUNT_SID) {
    console.warn('[twilio-sip-router] AccountSid invalide:', accountSid)
    return new Response('Forbidden', { status: 403 })
  }

  // Validation signature HMAC (niveau 2)
  const twilioSig = req.headers.get('X-Twilio-Signature') ?? ''
  if (TWILIO_WEBHOOK_URL) {
    const valid = await validateTwilioSignature(TWILIO_AUTH_TOKEN, TWILIO_WEBHOOK_URL, params, twilioSig)
    if (!valid) {
      console.warn('[twilio-sip-router] Signature HMAC invalide — url_used:', TWILIO_WEBHOOK_URL)
      return new Response('Forbidden', { status: 403 })
    }
  } else {
    // TWILIO_WEBHOOK_URL non configuré → signature non vérifiable derrière proxy
    // AccountSid seul fait office de garde-fou minimal
    console.warn('[twilio-sip-router] TWILIO_WEBHOOK_URL absent — HMAC skipped, req.url:', req.url)
  }

  const to = params.get('To') ?? ''
  if (!to) {
    return new Response('Bad Request: missing To', { status: 400 })
  }

  const normalized = to.startsWith('+') ? to : `+${to.replace(/^00/, '')}`
  const sipUri = `sip:${normalized}@${LIVEKIT_SIP_DOMAIN}`
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Sip>${sipUri}</Sip></Dial></Response>`

  console.log(`[twilio-sip-router] routed ***${normalized.slice(-4)} → SIP ${LIVEKIT_SIP_DOMAIN}`)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
})

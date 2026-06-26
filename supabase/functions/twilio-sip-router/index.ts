const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') ?? 'asfuzlk4elq.sip.livekit.cloud'
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!

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
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)

  // Validation AccountSid (niveau 1)
  const accountSid = params.get('AccountSid') ?? ''
  if (TWILIO_ACCOUNT_SID && accountSid !== TWILIO_ACCOUNT_SID) {
    console.warn('[twilio-sip-router] AccountSid invalide')
    return new Response('Forbidden', { status: 403 })
  }

  // Validation signature HMAC (niveau 2)
  const twilioSig = req.headers.get('X-Twilio-Signature') ?? ''
  const url = req.url
  const valid = await validateTwilioSignature(TWILIO_AUTH_TOKEN, url, params, twilioSig)
  if (!valid) {
    console.warn('[twilio-sip-router] Signature HMAC invalide')
    return new Response('Forbidden', { status: 403 })
  }

  const to = params.get('To') ?? ''
  if (!to) {
    return new Response('Bad Request: missing To', { status: 400 })
  }

  const normalized = to.startsWith('+') ? to : `+${to.replace(/^00/, '')}`
  const sipUri = `sip:${normalized}@${LIVEKIT_SIP_DOMAIN}`
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Sip>${sipUri}</Sip></Dial></Response>`

  console.log(`[twilio-sip-router] routed ***${normalized.slice(-4)} → SIP`)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
})

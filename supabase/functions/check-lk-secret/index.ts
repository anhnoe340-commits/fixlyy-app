
const LK_URL    = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY    = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''
const TRUNK_ID  = Deno.env.get('LIVEKIT_SIP_OUTBOUND_TRUNK_ID') ?? 'NOT_SET'

async function lkAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: { admin: true } })
  const input   = `${head}.${payload}`
  const key     = await crypto.subtle.importKey('raw', new TextEncoder().encode(LK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  const sigB64  = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${input}.${sigB64}`
}

Deno.serve(async () => {
  const log: string[] = []
  log.push(`TRUNK_ID=${TRUNK_ID}`)
  log.push(`LK_URL=${LK_URL}`)
  log.push(`LK_KEY=${LK_KEY.slice(0,12)}...`)
  log.push('')

  const token = await lkAdminToken()

  // List outbound trunks
  const r1 = await fetch(`${LK_URL}/twirp/livekit.SIP/ListSIPOutboundTrunk`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}'
  })
  const t1 = await r1.text()
  log.push(`ListOutbound ${r1.status}: ${t1.slice(0, 400)}`)

  return new Response(log.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain' } })
})

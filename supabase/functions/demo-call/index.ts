import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const LK_URL     = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY     = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET  = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''

// Numéro fixe dédié aux démos web — traçable dans le dashboard fixlyy@fixlyy.fr
const DEMO_FROM_NUMBER = '+33939248290'
const DEMO_TRUNK_ID    = 'ST_ZRxsr2kNdKXB'


async function lkCallToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-demo', iat: now, exp: now + 60, nbf: now, sip: { call: true } })
  const input   = `${head}.${payload}`
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(LK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${input}.${sigB64}`
}

function formatE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('33') && digits.length === 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+33${digits.slice(1)}`
  return `+${digits}`
}

const demoSchema = z.object({
  email:  z.string().email(),
  phone:  z.string().min(8).max(20),
  metier: z.string().optional(),
})

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  const ip = getClientIp(req)
  if (!checkRateLimit(ip, 'demo-call', 3, 3_600_000)) return TOO_MANY_REQUESTS(cors)

  const rawBody = await req.json().catch(() => null)
  const parsed  = demoSchema.safeParse(rawBody)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'invalid_input' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { email, metier = 'autre' } = parsed.data
  const phone = formatE164(parsed.data.phone)

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return new Response(JSON.stringify({ error: 'invalid_phone', message: 'Numéro de téléphone invalide.' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    console.error('[demo-call] LiveKit credentials manquants')
    return new Response(JSON.stringify({ error: 'service_unavailable' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SB_URL, SB_SERVICE)

  // Stocker le lead (non-bloquant)
  supabase.from('demo_leads').insert({ phone, email, metier }).then(() => {}).catch(() => {})

  const demoId     = crypto.randomUUID().slice(0, 8)
  const roomName   = `web-demo-${demoId}`
  const phoneClean = phone.replace(/\D/g, '')

  let token: string
  try {
    token = await lkCallToken()
  } catch (e: any) {
    console.error('[demo-call] lkCallToken error:', e.message)
    return new Response(JSON.stringify({ error: 'auth_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const sipRes = await fetch(`${LK_URL}/twirp/livekit.SIP/CreateSIPParticipant`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sipTrunkId:          DEMO_TRUNK_ID,
      sipCallTo:           phone,
      roomName,
      participantIdentity: `sip_out_${phoneClean}`,
      participantName:     `Démo web ${phone}`,
      participantMetadata: JSON.stringify({
        job_type: 'web_demo',
        outbound: true,
        metier,
      }),
      from:         DEMO_FROM_NUMBER,
      playRingtone: true,
    }),
  })

  if (!sipRes.ok) {
    const err = await sipRes.text().catch(() => '')
    console.error('[demo-call] LiveKit SIP error:', sipRes.status, err)
    return new Response(JSON.stringify({ error: 'call_failed', message: "Impossible de lancer l'appel. Réessayez dans quelques instants." }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  console.log(`[demo-call] SIP outbound OK: room=${roomName} → ***${phone.slice(-4)} metier=${metier}`)

  // Mettre à jour le lead avec le room name (non-bloquant)
  supabase.from('demo_leads').update({ vapi_call_id: roomName }).eq('phone', phone).eq('email', email).then(() => {}).catch(() => {})

  return new Response(JSON.stringify({ ok: true, roomName }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const LK_URL     = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY     = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET  = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''
const OUTBOUND_TRUNK_ID = Deno.env.get('LIVEKIT_SIP_OUTBOUND_TRUNK_ID') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METIER_LABELS: Record<string, string> = {
  plombier:     'plombier / chauffagiste',
  chauffagiste: 'plombier / chauffagiste',
  electricien:  'électricien',
  serrurier:    'serrurier',
  menuisier:    'menuisier',
  peintre:      'peintre / plâtrier',
  autre:        'artisan',
}

async function livekitAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: { admin: true } })
  const input   = `${head}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(LK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${input}.${sigB64}`
}

async function lkPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = await livekitAdminToken()
  const res = await fetch(`${LK_URL}/twirp/livekit.SIP/${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LiveKit ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  const ip = getClientIp(req)
  if (!checkRateLimit(`demo:${ip}`, 3, 3600000)) {
    return TOO_MANY_REQUESTS(cors)
  }

  let body: { phone?: string; email?: string; metier?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const phone  = (body.phone  ?? '').trim()
  const email  = (body.email  ?? '').trim().toLowerCase()
  const metier = (body.metier ?? 'autre').trim()

  if (!/^\+33[67]\d{8}$/.test(phone)) {
    return new Response(JSON.stringify({ error: 'invalid_phone', message: 'Numéro français mobile attendu (+33 6/7 XX XX XX XX)' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (!email.includes('@') || !email.includes('.')) {
    return new Response(JSON.stringify({ error: 'invalid_email' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    console.error('[demo-call] LiveKit env vars manquants')
    return new Response(JSON.stringify({ error: 'service_unavailable', message: 'Service temporairement indisponible.' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (!OUTBOUND_TRUNK_ID) {
    console.error('[demo-call] LIVEKIT_SIP_OUTBOUND_TRUNK_ID manquant')
    return new Response(JSON.stringify({ error: 'service_unavailable', message: 'Service temporairement indisponible.' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SB_URL, SB_SERVICE)

  // Stocker le lead (non-bloquant — ne pas bloquer l'appel si ça échoue)
  supabase.from('demo_leads').insert({ phone, email, metier, ip }).then(() => {}).catch(() => {})

  // Numéro "from" : premier numéro du pool non-quarantine
  const { data: poolEntry } = await supabase
    .from('phone_numbers_pool')
    .select('phone_number')
    .not('status', 'eq', 'quarantine')
    .limit(1)
    .single()
  const fromNumber = poolEntry?.phone_number ?? '+33939247081'

  // Room unique par appel : demo-{metier}-{uuid}
  const demoId   = crypto.randomUUID()
  const roomName = `demo-${metier}-${demoId}`
  const phoneClean = phone.replace(/\D/g, '')

  try {
    await lkPost('CreateSIPParticipant', {
      sipTrunkId:          OUTBOUND_TRUNK_ID,
      sipCallTo:           phone,
      roomName,
      participantIdentity: `sip_demo_${phoneClean}`,
      participantName:     `Démo ${METIER_LABELS[metier] ?? 'artisan'}`,
      participantMetadata: JSON.stringify({ demo: true, metier, email }),
      from:                fromNumber,
      playRingtone:        false,
    })

    console.log(`[demo-call] LiveKit SIP → ${phone} room=${roomName} from=${fromNumber}`)

    return new Response(JSON.stringify({ ok: true, roomName }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[demo-call] LiveKit error:', msg)
    return new Response(JSON.stringify({ error: 'call_failed', message: 'Impossible de déclencher l\'appel. Réessayez.' }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

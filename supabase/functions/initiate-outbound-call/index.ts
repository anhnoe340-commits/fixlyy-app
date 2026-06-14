import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const LK_URL     = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY     = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET  = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''
const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!

// Trunk SIP outbound partagé — créé automatiquement si absent puis logué pour stockage
let cachedOutboundTrunkId = Deno.env.get('LIVEKIT_SIP_OUTBOUND_TRUNK_ID') ?? ''

const cors = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ctrl = new AbortController()
  const t    = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

async function lkMakeToken(sipGrant: Record<string, boolean>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: sipGrant })
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

// CreateSIPParticipant → sip.call  |  gestion trunks/dispatch rules → sip.admin
const lkAdminToken = () => lkMakeToken({ admin: true })
const lkCallToken  = () => lkMakeToken({ call: true })

async function lkPost(path: string, body: unknown, useCallGrant = false): Promise<Record<string, unknown>> {
  const token = useCallGrant ? await lkCallToken() : await lkAdminToken()
  const res   = await fetchWithTimeout(`${LK_URL}/twirp/livekit.SIP/${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LiveKit ${path} ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>>
}

async function getOrCreateOutboundTrunk(): Promise<string> {
  if (cachedOutboundTrunkId) return cachedOutboundTrunkId

  console.warn('[outbound] LIVEKIT_SIP_OUTBOUND_TRUNK_ID absent — création automatique')
  const data = await lkPost('CreateSIPOutboundTrunk', {
    trunk: {
      name:         'fixlyy-outbound-twilio',
      address:      'sip.twilio.com',
      numbers:      [],
      authUsername: TWILIO_SID,
      authPassword: TWILIO_TOKEN,
    },
  })
  const id = (data as any)?.trunk?.sipTrunkId
    ?? (data as any)?.trunk?.sip_trunk_id
    ?? (data as any)?.sipTrunkId
    ?? (data as any)?.sip_trunk_id
  if (!id) throw new Error(`CreateSIPOutboundTrunk: id absent: ${JSON.stringify(data)}`)

  cachedOutboundTrunkId = id as string
  // IMPORTANT : stocker ce trunk ID comme secret Supabase LIVEKIT_SIP_OUTBOUND_TRUNK_ID
  console.warn(`[outbound] trunk créé : ${cachedOutboundTrunkId} → ajouter comme secret LIVEKIT_SIP_OUTBOUND_TRUNK_ID`)
  return cachedOutboundTrunkId
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Rate limit : max 10 appels sortants / min par IP
  const ip = getClientIp(req)
  const rl = await checkRateLimit(`outbound:${ip}`, 10, 60)
  if (!rl.allowed) return TOO_MANY_REQUESTS

  // Auth JWT artisan
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt        = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return new Response('Unauthorized', { status: 401, headers: cors })

  const supabase = createClient(SB_URL, SB_SERVICE)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: cors })

  const userId = user.id

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400, headers: cors })
  }

  const targetPhone    = (body.target_phone as string | null)?.trim() ?? ''
  const context        = body.context as string | null
  const onboardingCall = !!(body.onboarding_call as boolean | null)

  if (!/^\+[1-9]\d{7,14}$/.test(targetPhone)) {
    return new Response(JSON.stringify({ error: 'invalid_target_phone' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    return new Response(JSON.stringify({ error: 'livekit_not_configured' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, twilio_number, livekit_trunk_id, subscription_plan, company_name, assistant_name')
      .eq('id', userId)
      .single()

    if (!profile?.twilio_number) {
      return new Response(JSON.stringify({ error: 'number_not_configured' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (!profile?.livekit_trunk_id) {
      return new Response(JSON.stringify({ error: 'livekit_not_provisioned' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const outboundTrunkId  = await getOrCreateOutboundTrunk()
    const roomName          = `artisan-${userId}`
    const phoneClean        = targetPhone.replace(/\D/g, '')
    const participantId     = `sip_out_${phoneClean}`

    await lkPost('CreateSIPParticipant', {
      sipTrunkId:          outboundTrunkId,
      sipCallTo:           targetPhone,
      roomName,
      participantIdentity: participantId,
      participantName:     `Appel sortant ${targetPhone}`,
      participantMetadata: JSON.stringify({
        user_id: userId,
        outbound: true,
        ...(onboardingCall ? { onboarding_call: true, plan_id: profile.subscription_plan || 'solo' } : {}),
        ...(context ? { context } : {}),
      }),
      from:                profile.twilio_number,
      playRingtone:        false,
    }, true)

    await logEvent({
      supabase,
      eventType:    'outbound_call_initiated',
      userId,
      resourceType: 'call',
      resourceId:   null,
      metadata:     { target_phone: targetPhone, room: roomName, caller_id: profile.twilio_number, context },
      severity:     'info',
    })

    console.log(`[outbound] ${profile.twilio_number} → ${targetPhone} room=${roomName}`)

    return new Response(JSON.stringify({
      ok:                   true,
      room_name:            roomName,
      participant_identity: participantId,
      caller_id:            profile.twilio_number,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (e: any) {
    console.error('[outbound] error:', e.message)
    await logEvent({
      supabase,
      eventType:    'outbound_call_failed',
      userId,
      resourceType: 'call',
      resourceId:   null,
      metadata:     { target_phone: targetPhone, error: e.message },
      severity:     'warning',
    }).catch(() => {})
    return new Response(JSON.stringify({ error: 'internal_server_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

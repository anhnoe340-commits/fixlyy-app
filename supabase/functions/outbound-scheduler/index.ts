import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const LK_URL      = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY      = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET   = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''
const OUTBOUND_TRUNK = Deno.env.get('LIVEKIT_SIP_OUTBOUND_TRUNK_ID') ?? 'ST_CspEkTSYvisn'
const MONTHLY_LIMIT  = 100

const supabase = createClient(SB_URL, SB_SERVICE)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

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

async function lkPost(path: string, body: unknown, useCallGrant = false): Promise<Record<string, unknown>> {
  const grant = useCallGrant ? { call: true } : { admin: true }
  const token = await lkMakeToken(grant)
  const res   = await fetch(`${LK_URL}/twirp/livekit.SIP/${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LiveKit ${path} ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SB_SERVICE}`) {
    return new Response('Unauthorized', { status: 401, headers: cors })
  }

  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    return new Response(JSON.stringify({ error: 'livekit_not_configured' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { data: pendingCalls, error } = await supabase
      .from('outbound_calls')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .limit(20)

    if (error) throw error
    if (!pendingCalls || pendingCalls.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const results = { initiated: 0, skipped: 0, failed: 0 }

    for (const call of pendingCalls) {
      try {
        const monthStart = new Date()
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

        const { count: monthCount } = await supabase
          .from('outbound_calls')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', call.profile_id)
          .gte('created_at', monthStart.toISOString())
          .neq('status', 'cancelled')

        if ((monthCount ?? 0) > MONTHLY_LIMIT) {
          console.log(`[scheduler] profile ${call.profile_id} over monthly limit — skipping`)
          await supabase.from('outbound_calls')
            .update({ status: 'cancelled', metadata: { ...call.metadata, skip_reason: 'monthly_limit' } })
            .eq('id', call.id)
          results.skipped++
          continue
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, twilio_number, livekit_trunk_id, company_name, assistant_name, provisioning_status, outbound_calls_count')
          .eq('id', call.profile_id)
          .single()

        if (!profile?.twilio_number || !profile?.livekit_trunk_id || profile.provisioning_status !== 'done') {
          console.log(`[scheduler] profile ${call.profile_id} not ready — skipping`)
          results.skipped++
          continue
        }

        const roomName      = `artisan-${call.profile_id}`
        const phoneClean    = call.caller_phone.replace(/\D/g, '')
        const participantId = `sip_out_${phoneClean}_ob`

        await lkPost('CreateSIPParticipant', {
          sipTrunkId:          OUTBOUND_TRUNK,
          sipCallTo:           call.caller_phone,
          roomName,
          participantIdentity: participantId,
          participantName:     `Appel sortant ${call.reason}`,
          participantMetadata: JSON.stringify({
            user_id:          call.profile_id,
            outbound:         true,
            reason:           call.reason,
            caller_phone:     call.caller_phone,
            rdv_info:         call.metadata?.rdv_info ?? null,
            outbound_call_id: call.id,
          }),
          from:         profile.twilio_number,
          playRingtone: false,
        }, true)

        await supabase.from('outbound_calls')
          .update({ status: 'initiated', initiated_at: new Date().toISOString() })
          .eq('id', call.id)

        await supabase.from('profiles')
          .update({ outbound_calls_count: (profile.outbound_calls_count ?? 0) + 1 })
          .eq('id', call.profile_id)

        await logEvent({
          supabase,
          eventType:    'outbound_call_initiated',
          userId:       call.profile_id,
          resourceType: 'outbound_call',
          resourceId:   call.id,
          metadata:     { reason: call.reason, phone: call.caller_phone },
          severity:     'info',
        })

        results.initiated++
        console.log(`[scheduler] initiated ${call.reason} → ***${call.caller_phone.slice(-4)}`)
      } catch (callErr: any) {
        console.error(`[scheduler] call ${call.id} failed:`, callErr.message)
        await supabase.from('outbound_calls')
          .update({ status: 'failed', metadata: { ...call.metadata, error: callErr.message } })
          .eq('id', call.id)
        results.failed++
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (e: any) {
    console.error('[scheduler] error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_server_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'
import { logEvent } from '../_shared/audit.ts'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const serviceBodySchema = z.object({
  user_id: z.string().uuid(),
})

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const VAPI_KEY     = Deno.env.get('VAPI_API_KEY')!
const SB_URL       = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE   = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

const LK_URL    = (Deno.env.get('LIVEKIT_CLOUD_URL') ?? '').replace(/^wss?:\/\//, 'https://')
const LK_KEY    = Deno.env.get('LIVEKIT_CLOUD_API_KEY') ?? ''
const LK_SECRET = Deno.env.get('LIVEKIT_CLOUD_API_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const sb = createClient(SB_URL, SB_SERVICE)

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function log(status: string, durationMs: number, inputMeta: object, outputMeta: object, errorMessage?: string) {
  await sb.from('edge_function_logs').insert({
    function_name: 'assign-number-from-pool',
    status,
    duration_ms: durationMs,
    input_meta: inputMeta,
    output_meta: outputMeta,
    error_message: errorMessage || null,
  })
}

async function rollbackTwilioVoiceUrl(twilioSid: string) {
  try {
    await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilioSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ VoiceUrl: '', VoiceMethod: 'POST' }),
      }
    )
  } catch { /* non-bloquant */ }
}

async function rollbackLivekitTrunk(trunkId: string) {
  try {
    const token = await livekitAdminToken()
    await fetch(`${LK_URL}/twirp/livekit.SIP/DeleteSIPTrunk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sipTrunkId: trunkId }),
    })
  } catch { /* non-bloquant */ }
}

// ── LiveKit helpers ───────────────────────────────────────────────────────────
async function livekitAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const head    = enc({ alg: 'HS256', typ: 'JWT' })
  const payload = enc({ iss: LK_KEY, sub: 'sip-admin', iat: now, exp: now + 60, nbf: now, sip: { admin: true } })
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

// Extrait l'ID de trunk en conflit depuis le message d'erreur LiveKit
function extractConflictingTrunkId(errBody: string): string | null {
  const m = errBody.match(/"(ST_[A-Za-z0-9]+)"/)
  return m ? m[1] : null
}

// Supprime un trunk orphelin de LiveKit seulement s'il n'est dans aucun profil
async function deleteOrphanLivekitTrunk(trunkId: string): Promise<boolean> {
  const { data } = await sb.from('profiles').select('id').eq('livekit_trunk_id', trunkId).limit(1)
  if (data && data.length > 0) {
    console.warn(`[assign-number-from-pool] Trunk ${trunkId} encore en use dans profiles — skip delete`)
    return false
  }
  try {
    const token = await livekitAdminToken()
    const res = await fetchWithTimeout(`${LK_URL}/twirp/livekit.SIP/DeleteSIPTrunk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sipTrunkId: trunkId }),
    }, 10000)
    console.log(`[assign-number-from-pool] Trunk orphelin ${trunkId} supprimé: ${res.status}`)
    return res.ok
  } catch (e) {
    console.error(`[assign-number-from-pool] Erreur delete trunk orphelin ${trunkId}:`, e)
    return false
  }
}

async function createLivekitSipTrunk(userId: string, phoneNumber: string): Promise<string> {
  const token = await livekitAdminToken()
  const res = await fetchWithTimeout(
    `${LK_URL}/twirp/livekit.SIP/CreateSIPInboundTrunk`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trunk: { name: `artisan-${userId.slice(0, 8)}`, numbers: [phoneNumber] },
      }),
    },
    12000,
  )
  if (!res.ok) {
    const body = await res.text()
    console.error(`[assign-number-from-pool] LiveKit CreateSIPInboundTrunk error: status=${res.status} body=${body}`)

    // Si conflit de trunk → tenter de nettoyer le trunk orphelin et réessayer une fois
    if (res.status === 400 && body.includes('Conflicting inbound SIP Trunks')) {
      const conflictId = extractConflictingTrunkId(body)
      if (conflictId) {
        console.log(`[assign-number-from-pool] Conflit trunk ${conflictId} sur ${phoneNumber} — tentative nettoyage`)
        const deleted = await deleteOrphanLivekitTrunk(conflictId)
        if (deleted) {
          // Retry
          const token2 = await livekitAdminToken()
          const res2 = await fetchWithTimeout(
            `${LK_URL}/twirp/livekit.SIP/CreateSIPInboundTrunk`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                trunk: { name: `artisan-${userId.slice(0, 8)}`, numbers: [phoneNumber] },
              }),
            },
            12000,
          )
          if (res2.ok) {
            const data2 = await res2.json()
            const id2 = data2?.sip_trunk_id ?? data2?.sipTrunkId ?? data2?.trunk?.sip_trunk_id ?? data2?.trunk?.sipTrunkId
            if (id2) return id2 as string
          }
          const body2 = await res2.text().catch(() => '')
          console.error(`[assign-number-from-pool] Retry LiveKit trunk failed: ${body2}`)
        }
      }
    }

    throw new Error(`LiveKit CreateSIPInboundTrunk ${res.status}: ${body}`)
  }
  const data = await res.json()
  const id = data?.sip_trunk_id ?? data?.sipTrunkId ?? data?.trunk?.sip_trunk_id ?? data?.trunk?.sipTrunkId
  if (!id) throw new Error(`LiveKit trunk: sip_trunk_id absent dans la réponse: ${JSON.stringify(data)}`)
  return id as string
}

async function createLivekitDispatchRule(userId: string, trunkId: string): Promise<string> {
  const token = await livekitAdminToken()
  const res = await fetchWithTimeout(
    `${LK_URL}/twirp/livekit.SIP/CreateSIPDispatchRule`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trunkIds: [trunkId],
        rule: { dispatchRuleDirect: { roomName: `artisan-${userId}`, pin: '' } },
        name: `artisan-${userId.slice(0, 8)}-rule`,
      }),
    },
    12000,
  )
  if (!res.ok) {
    const body = await res.text()
    console.error(`[assign-number-from-pool] LiveKit CreateSIPDispatchRule error: status=${res.status} body=${body}`)
    throw new Error(`LiveKit CreateSIPDispatchRule ${res.status}: ${body}`)
  }
  const data = await res.json()
  const id = data?.sip_dispatch_rule_id ?? data?.sipDispatchRuleId
    ?? data?.rule?.sip_dispatch_rule_id ?? data?.rule?.sipDispatchRuleId
  if (!id) throw new Error(`LiveKit dispatch rule: id absent dans la réponse: ${JSON.stringify(data)}`)
  return id as string
}

async function recordTrialFingerprint(
  userId: string,
  phone: string | null,
  ip: string,
  email: string | null,
): Promise<void> {
  let phoneMatch: any = null
  let ipMatch: any = null

  if (phone) {
    const { data } = await sb
      .from('trial_fingerprints')
      .select('id, user_id, email')
      .eq('phone', phone)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle()
    phoneMatch = data
  }

  if (ip !== 'unknown') {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const { data } = await sb
      .from('trial_fingerprints')
      .select('id, user_id, email')
      .eq('ip_address', ip)
      .gte('created_at', ninetyDaysAgo)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle()
    ipMatch = data
  }

  const isSuspicious = !!(phoneMatch || ipMatch)
  const matchType = phoneMatch && ipMatch ? 'both' : phoneMatch ? 'phone' : ipMatch ? 'ip' : null

  await sb.from('trial_fingerprints').upsert({
    user_id: userId,
    phone,
    ip_address: ip,
    email,
    trial_started_at: new Date().toISOString(),
    is_suspicious: isSuspicious,
    suspicious_reason: matchType === 'both'
      ? "Même téléphone et IP qu'un essai précédent"
      : matchType === 'phone'
      ? "Même téléphone qu'un essai précédent"
      : matchType === 'ip'
      ? "Même IP qu'un essai précédent (90j)"
      : null,
  }, { onConflict: 'user_id', ignoreDuplicates: false })

  if (isSuspicious && matchType) {
    const previous = phoneMatch ?? ipMatch
    await sb.from('critical_alerts').insert({
      alert_type: 'trial_abuse_suspected',
      severity: 'warning',
      message: `Possible abus d'essai gratuit — ${matchType === 'both' ? 'Téléphone + IP' : matchType === 'phone' ? 'Même téléphone' : 'Même IP (90j)'}`,
      meta: {
        new_user_id: userId,
        new_email: email,
        new_phone: phone,
        ip_address: ip,
        previous_user_id: previous.user_id,
        previous_email: previous.email,
        match_type: matchType,
        detected_at: new Date().toISOString(),
      },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SB_SERVICE}`) {
    const ip = getClientIp(req)
    if (!checkRateLimit(ip, 5, 60000)) return TOO_MANY_REQUESTS(corsHeaders)
  }

  const startMs = Date.now()
  let userId: string

  if (authHeader === `Bearer ${SB_SERVICE}`) {
    const rawBody = await req.json().catch(() => null)
    const parsed = serviceBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: corsHeaders })
    }
    userId = parsed.data.user_id
  } else {
    try {
      const { data: { user }, error: authErr } = await createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(authHeader.replace('Bearer ', ''))
      if (authErr || !user) {
        await sb.from('audit_log').insert({
          event_type: 'auth_failure',
          user_id: null,
          metadata: { ip: getClientIp(req), endpoint: 'assign-number-from-pool' },
          severity: 'warning',
        }).catch(() => {})
        return new Response('Unauthorized', { status: 401, headers: corsHeaders })
      }
      userId = user.id
    } catch {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }
  }

  let assignedRow: any = null
  let twilioPatched = false
  let twilioAlreadyConfigured = false
  let createdLivekitTrunkId: string | null = null

  try {
    // 1. Réservation atomique via RPC PostgreSQL
    // Le RPC filtre strictement sur status = 'available' — les numéros en
    // 'quarantine' ou 'assigned' ne peuvent jamais être sélectionnés ici.
    const { data: rows, error: reserveErr } = await sb.rpc('assign_phone_number_to_user', { p_user_id: userId })
    if (reserveErr) throw new Error(reserveErr.message)
    assignedRow = rows?.[0]
    if (!assignedRow) throw new Error('no_number_available')

    const { phone_number_id, twilio_sid, phone_number } = assignedRow

    // 2. Récupérer le profil
    const { data: profileData } = await sb
      .from('profiles')
      .select('company_name, company_type, assistant_name, assistant_voice, greeting_open, vapi_assistant_id, phone, livekit_trunk_id, livekit_dispatch_rule_id')
      .eq('id', userId)
      .single()

    // 2b. Fingerprinting anti-abus (non-bloquant)
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
      const { data: { user: authUser } } = await sb.auth.admin.getUserById(userId)
      const email = authUser?.email ?? null
      const phone = profileData?.phone ?? null
      await recordTrialFingerprint(userId, phone, ip, email)
    } catch (fpErr) {
      console.warn('[assign-number-from-pool] fingerprint non-bloquant:', fpErr)
    }

    // 3. Vapi PATCH — uniquement pour les 2 numéros legacy qui ont déjà un mapping Vapi
    // (Les nouveaux numéros n'ont pas vapi_phone_number_id — pas de création d'assistant Vapi)
    twilioAlreadyConfigured = !!assignedRow.vapi_phone_number_id
    if (assignedRow.vapi_phone_number_id) {
      const existingAssistantId = profileData?.vapi_assistant_id ?? null
      const vapiRes = await fetchWithTimeout(`https://api.vapi.ai/phone-number/${assignedRow.vapi_phone_number_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(existingAssistantId ? { assistantId: existingAssistantId } : {}),
          twilioAccountSid: TWILIO_SID,
          twilioAuthToken: TWILIO_TOKEN,
        }),
      })
      if (!vapiRes.ok) {
        const body = await vapiRes.text()
        console.error(`[assign-number-from-pool] Vapi PATCH phone-number error: status=${vapiRes.status} body=${body}`)
        throw new Error(`Vapi PATCH phone-number failed: ${vapiRes.status} ${body}`)
      }
    }

    // 4. PATCH Twilio VoiceUrl → SIP router LiveKit
    const twilioRes = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilio_sid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          VoiceUrl:    `${SB_URL}/functions/v1/twilio-sip-router`,
          VoiceMethod: 'POST',
        }),
      }
    )
    if (!twilioRes.ok) {
      const body = await twilioRes.text()
      console.error(`[assign-number-from-pool] Twilio PATCH VoiceUrl error: status=${twilioRes.status} body=${body}`)
      throw new Error(`Twilio PATCH failed: ${twilioRes.status} ${body}`)
    }
    twilioPatched = true

    // 5. LiveKit SIP trunk + dispatch rule (BLOQUANT — provisioning_status ne sera 'done'
    // qu'après succès LiveKit)
    let lkTrunkId       = profileData?.livekit_trunk_id   as string | undefined
    let lkDispatchRuleId = profileData?.livekit_dispatch_rule_id as string | undefined

    if (lkTrunkId) {
      // Upsert : mettre à jour le trunk existant si le numéro a changé
      const token = await livekitAdminToken()
      const updRes = await fetchWithTimeout(
        `${LK_URL}/twirp/livekit.SIP/UpdateSIPInboundTrunk`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sipTrunkId: lkTrunkId,
            replace: { name: `artisan-${userId.slice(0, 8)}`, numbers: [phone_number] },
          }),
        },
        12000,
      )
      if (!updRes.ok) {
        const body = await updRes.text()
        console.error(`[assign-number-from-pool] LiveKit UpdateSIPInboundTrunk error: status=${updRes.status} body=${body}`)
        throw new Error(`LiveKit UpdateSIPInboundTrunk ${updRes.status}: ${body}`)
      }

      if (lkDispatchRuleId) {
        const token2 = await livekitAdminToken()
        const updRuleRes = await fetchWithTimeout(
          `${LK_URL}/twirp/livekit.SIP/UpdateSIPDispatchRule`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sipDispatchRuleId: lkDispatchRuleId,
              replace: {
                trunkIds: [lkTrunkId],
                rule: { dispatchRuleDirect: { roomName: `artisan-${userId}`, pin: '' } },
                name: `artisan-${userId.slice(0, 8)}-rule`,
              },
            }),
          },
          12000,
        )
        if (!updRuleRes.ok) {
          const body = await updRuleRes.text()
          console.error(`[assign-number-from-pool] LiveKit UpdateSIPDispatchRule error: status=${updRuleRes.status} body=${body}`)
          throw new Error(`LiveKit UpdateSIPDispatchRule ${updRuleRes.status}: ${body}`)
        }
      } else {
        lkDispatchRuleId = await createLivekitDispatchRule(userId, lkTrunkId)
      }
    } else {
      lkTrunkId = await createLivekitSipTrunk(userId, phone_number)
      createdLivekitTrunkId = lkTrunkId
      lkDispatchRuleId = await createLivekitDispatchRule(userId, lkTrunkId)
    }

    // 6. Finalise en base — seulement après succès LiveKit
    await sb.from('phone_numbers_pool').update({
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      ...(assignedRow.vapi_phone_number_id ? { vapi_phone_number_id: assignedRow.vapi_phone_number_id } : {}),
    }).eq('id', phone_number_id)

    await sb.from('profiles').update({
      twilio_number: phone_number,
      provisioning_status: 'done',
      livekit_trunk_id:         lkTrunkId,
      livekit_dispatch_rule_id: lkDispatchRuleId,
    }).eq('id', userId)

    await log('success', Date.now() - startMs, { userId }, {
      phone_number,
      livekit_trunk_id: lkTrunkId,
      livekit_dispatch_rule_id: lkDispatchRuleId,
    })
    await logEvent({ supabase: sb, eventType: 'number_assigned',
      userId, resourceType: 'phone_number', resourceId: phone_number,
      metadata: { livekit_trunk_id: lkTrunkId, livekit_dispatch_rule_id: lkDispatchRuleId }, severity: 'info' })

    return new Response(JSON.stringify({ phone_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    // Rollback trunk LiveKit si créé mais dispatch rule a échoué
    if (createdLivekitTrunkId) await rollbackLivekitTrunk(createdLivekitTrunkId)
    // Rollback Twilio VoiceUrl si patché pour un nouveau numéro
    if (twilioPatched && !twilioAlreadyConfigured && assignedRow?.twilio_sid) {
      await rollbackTwilioVoiceUrl(assignedRow.twilio_sid)
    }
    // Rollback pool
    if (assignedRow?.phone_number_id) {
      await sb.from('phone_numbers_pool').update({
        status: 'available',
        reserved_at: null,
        assigned_to_user_id: null,
      }).eq('id', assignedRow.phone_number_id)
    }

    const isPoolEmpty = err.message === 'no_number_available'
    if (isPoolEmpty) {
      await sb.from('critical_alerts').insert({
        alert_type: 'pool_empty',
        severity: 'critical',
        message: `Pool vide lors d'une tentative d'assignation pour user ${userId}`,
        meta: { user_id: userId },
      })
    }

    await sb.from('profiles').update({ provisioning_status: 'failed' }).eq('id', userId)
    await log('error', Date.now() - startMs, { userId }, {}, err.message)
    await logEvent({ supabase: sb, eventType: 'number_assignment_failed',
      userId, resourceType: 'phone_number', resourceId: null,
      metadata: { error: err.message }, severity: 'warning' })
    const publicError = isPoolEmpty ? 'service_unavailable' : 'internal_server_error'
    return new Response(JSON.stringify({ error: publicError }), {
      status: isPoolEmpty ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

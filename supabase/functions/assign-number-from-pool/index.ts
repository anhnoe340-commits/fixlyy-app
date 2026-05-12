import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')!
const VAPI_KEY          = Deno.env.get('VAPI_API_KEY')!
const VAPI_ASSISTANT_ID = Deno.env.get('VAPI_DEFAULT_ASSISTANT_ID')!
const SB_URL            = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE        = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const sb = createClient(SB_URL, SB_SERVICE)

// fetch avec timeout explicite (évite qu'un hang Twilio/Vapi bloque indéfiniment)
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

// Remet le voiceUrl Twilio à vide en cas de rollback après PATCH réussi
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
  } catch {
    // Non bloquant : le cleanup_stale_reservations libèrera la row dans 30 min
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startMs = Date.now()
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data: { user }, error: authErr } = await createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const userId = user.id
  let assignedRow: any = null
  let twilioPatched = false  // garde trace si le PATCH Twilio a réussi

  try {
    // 1. Réservation atomique via stored procedure (SELECT FOR UPDATE SKIP LOCKED en SQL)
    const { data: rows, error: reserveErr } = await sb.rpc('assign_phone_number_to_user', { p_user_id: userId })
    if (reserveErr) throw new Error(reserveErr.message)
    assignedRow = rows?.[0]
    if (!assignedRow) throw new Error('no_number_available')

    const { phone_number_id, twilio_sid, phone_number } = assignedRow

    // Si déjà fully assigned (vapi_phone_number_id existe), retour immédiat
    if (assignedRow.vapi_phone_number_id) {
      await sb.from('profiles').update({ twilio_number: phone_number }).eq('id', userId)
      await log('success', Date.now() - startMs, { userId }, { phone_number, already_assigned: true })
      return new Response(JSON.stringify({ phone_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. PATCH Twilio voiceUrl → Vapi
    const twilioRes = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${twilio_sid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          VoiceUrl: 'https://api.vapi.ai/call/phone',
          VoiceMethod: 'POST',
        }),
      }
    )
    if (!twilioRes.ok) throw new Error(`Twilio PATCH failed: ${twilioRes.status}`)
    twilioPatched = true

    // 3. Créer le mapping Vapi phone number → assistant
    const vapiRes = await fetchWithTimeout('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'twilio',
        number: phone_number,
        twilioAccountSid: TWILIO_SID,
        twilioAuthToken: TWILIO_TOKEN,
        assistantId: VAPI_ASSISTANT_ID,
        name: `fixlyy-${userId.slice(0, 8)}`,
      }),
    })
    if (!vapiRes.ok) throw new Error(`Vapi POST failed: ${vapiRes.status} ${await vapiRes.text()}`)
    const vapiData = await vapiRes.json()
    const vapiPhoneNumberId = vapiData.id

    // 4. Finalise l'assignation en base
    await sb.from('phone_numbers_pool').update({
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      vapi_phone_number_id: vapiPhoneNumberId,
    }).eq('id', phone_number_id)

    // 5. Met à jour le profil artisan
    await sb.from('profiles').update({
      twilio_number: phone_number,
      vapi_assistant_id: VAPI_ASSISTANT_ID,
    }).eq('id', userId)

    // 6. Patch la voix ElevenLabs selon le profil (female-warm par défaut)
    const VOICE_IDS: Record<string, string> = {
      'female-warm': 'FFXYdAYPzn8Tw8KiHZqg',
      'male-pro':    'BVBq6HVJVdnwOMJOqvy9',
    }
    try {
      const { data: profileData } = await sb.from('profiles').select('assistant_voice').eq('id', userId).single()
      const voiceKey = profileData?.assistant_voice || 'female-warm'
      const voiceId  = VOICE_IDS[voiceKey] ?? VOICE_IDS['female-warm']
      await fetchWithTimeout(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            provider: 'elevenlabs',
            voiceId,
            model: 'eleven_multilingual_v2',
            stability: 0.5,
            similarityBoost: 0.75,
          },
        }),
      })
    } catch (e: any) {
      console.error('voice patch failed (non-blocking):', e.message)
    }

    await log('success', Date.now() - startMs, { userId }, { phone_number, vapi_phone_number_id: vapiPhoneNumberId })
    return new Response(JSON.stringify({ phone_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    // Rollback : remet le Twilio voiceUrl à vide si on l'avait déjà patché
    if (twilioPatched && assignedRow?.twilio_sid) {
      await rollbackTwilioVoiceUrl(assignedRow.twilio_sid)
    }

    // Rollback : libère la réservation pool si on n'a pas finalisé
    if (assignedRow?.phone_number_id && !assignedRow?.vapi_phone_number_id) {
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

    await log('error', Date.now() - startMs, { userId }, {}, err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: isPoolEmpty ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'
import { featureAllowed } from '../_shared/planGate.ts'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH  = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)

const supabase = createClient(SB_URL, SB_SERVICE)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

async function sendSms(from: string, to: string, body: string): Promise<void> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${TWILIO_AUTH}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || `SMS failed ${res.status}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Auth : service_role uniquement (appelé par l'agent Python)
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SB_SERVICE}`) {
    return new Response('Unauthorized', { status: 401, headers: cors })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400, headers: cors })
  }

  const userId        = body.user_id        as string | null
  const callerNumber  = body.caller_number  as string | null ?? 'Inconnu'
  const transcript    = body.transcript     as string | null
  const durationSecs  = body.duration_seconds as number | null ?? 0
  const callerName    = body.caller_name    as string | null
  const callerPhone   = body.caller_phone   as string | null
  const callerAddress = body.caller_address as string | null
  const reason        = body.reason         as string | null
  const urgency       = body.urgency        as string | null
  const fullSummary   = body.full_summary   as string | null
  const smsBody       = body.sms_body       as string | null
  const apptDate      = body.appointment_date as string | null
  const apptTime      = body.appointment_time as string | null

  if (!userId) {
    return new Response(JSON.stringify({ error: 'missing user_id' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 1. Récupérer le profil artisan
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone, twilio_number, assistant_name, company_name, subscription_plan')
      .eq('id', userId)
      .single()

    if (!profile) {
      console.error('[livekit-call-ended] profile not found for user_id:', userId)
      return new Response(JSON.stringify({ error: 'profile_not_found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 2. Insérer dans calls
    await supabase.from('calls').insert({
      artisan_id:       profile.id,
      caller_phone:     callerNumber,
      caller_name:      callerName,
      duration_seconds: durationSecs,
      summary:          fullSummary,
      sms_body:         smsBody,
      reason,
      status:           urgency === 'urgent' ? 'urgent' : 'new',
      transcript,
    })

    await logEvent({
      supabase,
      eventType:    'livekit_call_ended',
      userId:       profile.id,
      resourceType: 'call',
      resourceId:   null,
      metadata:     { caller: callerNumber, duration_sec: durationSecs },
      severity:     'info',
    })

    // 3. RDV si date collectée
    if (apptDate) {
      await supabase.from('appointments').insert({
        artisan_id:       profile.id,
        client_name:      callerName,
        client_phone:     callerNumber !== 'Inconnu' ? callerNumber : null,
        reason,
        appointment_date: apptDate,
        appointment_time: apptTime ?? 'A confirmer',
        status:           'pending',
      }).catch(e => console.error('appointments insert failed:', e.message))
    }

    // 4. SMS artisan — seulement si téléphone + numéro Twilio configurés
    if (!profile.phone || !profile.twilio_number) {
      console.log('[livekit-call-ended] no phone/twilio_number — SMS skipped')
      return new Response(JSON.stringify({ ok: true, sms: false }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!featureAllowed(profile.subscription_plan, 'sms_confirmation')) {
      console.log(`[livekit-call-ended] SMS skipped — plan ${profile.subscription_plan}`)
      return new Response(JSON.stringify({ ok: true, sms: false }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Construire le SMS artisan — GSM-7, zero emoji
    const isUrgent = urgency === 'urgent'
    const effectivePhone = callerPhone || (callerNumber !== 'Inconnu' ? callerNumber : null)
    const bodyText = fullSummary || smsBody || ''

    const smsParts: string[] = []
    smsParts.push(isUrgent
      ? `[URGENT] ${callerName || 'Client inconnu'}`
      : `[APPEL] ${callerName || 'Client inconnu'}`)
    if (effectivePhone) smsParts.push(`Tel : ${effectivePhone}`)
    if (callerAddress)  smsParts.push(`Adresse : ${callerAddress}`)
    if (reason)         smsParts.push(`Motif : ${reason}`)
    smsParts.push(isUrgent ? 'Urgence : oui' : 'Urgence : non')
    smsParts.push('')
    smsParts.push(bodyText)
    smsParts.push('')
    smsParts.push(apptDate
      ? `Dispo : ${apptDate}${apptTime ? ` a ${apptTime}` : ''}`
      : 'Dispo : non precise')
    smsParts.push(`-- ${profile.assistant_name || 'Mia'}, Fixlyy`)
    const smsText = smsParts.join('\n')

    await sendSms(profile.twilio_number, profile.phone, smsText)
    console.log('[livekit-call-ended] SMS artisan sent')

    // Relay SMS membres d'équipe
    try {
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('member_user_id')
        .eq('owner_user_id', profile.id)
        .eq('status', 'active')
        .eq('receive_sms_recap', true)
      if (teamMembers && teamMembers.length > 0) {
        const memberIds = teamMembers.map(m => m.member_user_id).filter(Boolean)
        if (memberIds.length > 0) {
          const { data: memberProfiles } = await supabase
            .from('profiles').select('phone').in('id', memberIds)
          for (const mp of (memberProfiles || [])) {
            if (mp.phone && /^\+[1-9]\d{7,14}$/.test(mp.phone)) {
              await sendSms(profile.twilio_number, mp.phone, smsText).catch(e =>
                console.error('SMS relay member failed:', e.message)
              )
            }
          }
        }
      }
    } catch (e: any) {
      console.error('SMS team relay failed (non-blocking):', e.message)
    }

    // SMS confirmation au client
    const isValidCaller = callerNumber !== 'Inconnu' && /^\+[1-9]\d{7,14}$/.test(callerNumber)
    if (isValidCaller) {
      const company = (profile.company_name || 'votre artisan').slice(0, 60)
      const clientSms = `Bonjour, votre demande a bien ete transmise a ${company}. Vous serez recontacte rapidement. - Fixlyy`
      await sendSms(profile.twilio_number, callerNumber, clientSms).catch(e =>
        console.log('SMS client echec (non-bloquant):', e.message)
      )
    }

    return new Response(JSON.stringify({ ok: true, sms: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (e: any) {
    console.error('[livekit-call-ended] error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_server_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'
import { featureAllowed, getIncludedMinutes } from '../_shared/planGate.ts'

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
  const transferredTo   = body.transferred_to    as string | null
  const transferredAt   = body.transferred_at    as string | null
  const hasDevisMention = !!(body.has_devis_mention as boolean | null)
  const isOutbound      = !!(body.is_outbound      as boolean | null)

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
      ...(transferredTo ? { transferred_to: transferredTo, transferred_at: transferredAt ?? new Date().toISOString() } : {}),
    })

    // 3. Compteur de minutes mensuel — alertes quota plan
    try {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data: monthCalls } = await supabase
        .from('calls')
        .select('duration_seconds')
        .eq('artisan_id', profile.id)
        .gte('created_at', startOfMonth.toISOString())

      const totalSeconds = (monthCalls ?? []).reduce(
        (sum: number, c: { duration_seconds: number | null }) => sum + (c.duration_seconds ?? 0), 0
      )
      const totalMinutes = Math.ceil(totalSeconds / 60)
      const includedMinutes = getIncludedMinutes(profile.subscription_plan)
      const pct = Math.round((totalMinutes / includedMinutes) * 100)

      console.log(`[livekit-call-ended] quota: ${totalMinutes}/${includedMinutes} min (${pct}%)`)

      // Alerte 80% : SMS unique ce mois (on vérifie si déjà alerté)
      if (pct >= 80 && pct < 100) {
        const { count } = await supabase
          .from('critical_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('alert_type', 'quota_80pct')
          .eq('meta->>user_id', profile.id)
          .gte('created_at', startOfMonth.toISOString())

        if ((count ?? 0) === 0) {
          await supabase.from('critical_alerts').insert({
            alert_type: 'quota_80pct',
            severity: 'warning',
            message: `${profile.company_name || profile.id} a consomme ${totalMinutes}/${includedMinutes} min (${pct}%) ce mois`,
            meta: { user_id: profile.id, total_minutes: totalMinutes, included_minutes: includedMinutes, pct },
          })
          // SMS à l'artisan si numéro disponible
          if (profile.phone && profile.twilio_number) {
            const alertSms = `[Fixlyy] Attention : vous avez utilise ${totalMinutes} min sur ${includedMinutes} incluses ce mois (${pct}%). Au-dela, chaque minute est facturee 0,25 EUR.`
            await sendSms(profile.twilio_number, profile.phone, alertSms).catch(e =>
              console.error('SMS quota_80pct failed:', e.message)
            )
          }
        }
      }

      // Alerte 100% : SMS + critical_alert
      if (pct >= 100) {
        const { count } = await supabase
          .from('critical_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('alert_type', 'quota_exceeded')
          .eq('meta->>user_id', profile.id)
          .gte('created_at', startOfMonth.toISOString())

        if ((count ?? 0) === 0) {
          await supabase.from('critical_alerts').insert({
            alert_type: 'quota_exceeded',
            severity: 'high',
            message: `${profile.company_name || profile.id} a depasse son quota : ${totalMinutes}/${includedMinutes} min`,
            meta: { user_id: profile.id, total_minutes: totalMinutes, included_minutes: includedMinutes, pct },
          })
          if (profile.phone && profile.twilio_number) {
            const overSms = `[Fixlyy] Quota depasse : ${totalMinutes} min utilisees ce mois (inclus : ${includedMinutes}). Les minutes supplementaires sont facturees 0,25 EUR/min. Passez au plan superieur pour plus de minutes.`
            await sendSms(profile.twilio_number, profile.phone, overSms).catch(e =>
              console.error('SMS quota_exceeded failed:', e.message)
            )
          }
        }
      }
    } catch (qe: any) {
      console.error('[livekit-call-ended] quota check failed (non-blocking):', qe.message)
    }

    await logEvent({
      supabase,
      eventType:    'livekit_call_ended',
      userId:       profile.id,
      resourceType: 'call',
      resourceId:   null,
      metadata:     { caller: callerNumber, duration_sec: durationSecs },
      severity:     'info',
    })

    // 4. RDV si date collectée
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

    // 4b. Appels sortants automatiques
    // Normaliser en E.164 (agent.py envoie "33939247033" sans le +)
    const e164Caller = callerNumber !== 'Inconnu' && !callerNumber.startsWith('+')
      ? `+${callerNumber}`
      : callerNumber
    const isValidCallerForOutbound = e164Caller !== 'Inconnu' && /^\+[1-9]\d{7,14}$/.test(e164Caller)

    if (!isOutbound && isValidCallerForOutbound) {
      // Rappel client manqué : appel < 30 secondes
      if (durationSecs < 30) {
        const scheduledAt = new Date(Date.now() + 60 * 1000).toISOString()
        const { count: existingMissed } = await supabase
          .from('outbound_calls')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', profile.id)
          .eq('caller_phone', e164Caller)
          .eq('reason', 'missed_callback')
          .eq('status', 'pending')
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

        if ((existingMissed ?? 0) === 0) {
          await supabase.from('outbound_calls').insert({
            profile_id:   profile.id,
            caller_phone: e164Caller,
            reason:       'missed_callback',
            scheduled_at: scheduledAt,
          }).catch(e => console.error('missed_callback insert failed:', e.message))
          console.log(`[livekit-call-ended] missed_callback scheduled for ${e164Caller}`)
        }
      }

      // Suivi devis : 48h après si devis mentionné
      if (hasDevisMention) {
        const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        const { count: existingDevis } = await supabase
          .from('outbound_calls')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', profile.id)
          .eq('caller_phone', e164Caller)
          .eq('reason', 'devis_followup')
          .in('status', ['pending', 'initiated'])
          .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

        if ((existingDevis ?? 0) === 0) {
          await supabase.from('outbound_calls').insert({
            profile_id:   profile.id,
            caller_phone: e164Caller,
            reason:       'devis_followup',
            scheduled_at: scheduledAt,
          }).catch(e => console.error('devis_followup insert failed:', e.message))
          console.log(`[livekit-call-ended] devis_followup scheduled for ${e164Caller}`)
        }
      }
    }

    // 5. SMS artisan — seulement si téléphone + numéro Twilio configurés
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

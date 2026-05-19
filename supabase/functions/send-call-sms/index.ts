import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY')
const VAPI_WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET')
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const FULL_STRUCTURED_DATA_SCHEMA = {
  type: 'object',
  properties: {
    customerName:             { type: 'string', description: 'Prénom et nom du client tel que donné' },
    customerPhone:            { type: 'string', description: 'Numéro de téléphone du client' },
    customerAddress:          { type: 'string', description: 'Adresse complète de l\'intervention' },
    reason:                   { type: 'string', description: 'Raison de l\'appel en 1 phrase courte' },
    urgency:                  { type: 'string', enum: ['urgent', 'non_urgent'] },
    appointmentDate:          { type: 'string', description: 'Date souhaitée si mentionnée' },
    appointmentTime:          { type: 'string', description: 'Heure souhaitée si mentionnée' },
    smsBody:                  { type: 'string', description: "Accroche courte max 80 chars : nature exacte du problème + action immédiate. Toujours en français." },
    fullSummary:              { type: 'string', description: "Résumé complet en 3 phrases max, toujours en français : (1) raison de l'appel, (2) nom + adresse + téléphone + détail technique, (3) URGENT/NORMAL/PEUT ATTENDRE + action concrète pour l'artisan. Style note de chantier, factuel." },
    clientTone:               { type: 'string', enum: ['calme', 'stressé', 'agressif', 'confus'] },
    aiToneUsed:               { type: 'string', enum: ['efficace', 'empathique', 'rassurante'] },
    conversationQualityScore: { type: 'integer', description: 'Note 0-10' },
    conversationQualityNotes: { type: 'string', description: 'Note en 1 phrase sur la qualité de l\'appel' },
  },
}

// Construit le contexte temporel Paris pour l'assistant-request
function buildDateContext(): string {
  const DAYS   = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
  const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const now = new Date()
  // Heure Paris via offset
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const tomorrow = new Date(paris); tomorrow.setDate(paris.getDate() + 1)
  const hh = String(paris.getHours()).padStart(2, '0')
  const mm = String(paris.getMinutes()).padStart(2, '0')
  return `\n\n[CONTEXTE TEMPOREL — NE JAMAIS INVENTER DE DATE]\nAujourd'hui : ${DAYS[paris.getDay()]} ${paris.getDate()} ${MONTHS[paris.getMonth()]} ${paris.getFullYear()}, il est ${hh}h${mm} (heure de Paris).\nDemain : ${DAYS[tomorrow.getDay()]} ${tomorrow.getDate()} ${MONTHS[tomorrow.getMonth()]} ${tomorrow.getFullYear()}.\nRègle absolue : si le client dit "demain", utilise UNIQUEMENT la date ci-dessus. Ne propose JAMAIS une date déjà passée.\n\n[RÈGLE ADRESSE — OBLIGATOIRE]\nTu dois TOUJOURS demander l'adresse complète de l'intervention avant de raccrocher. Si le client ne l'a pas donnée spontanément, pose la question directement : "Pouvez-vous me donner l'adresse de l'intervention ?" Sans adresse, l'artisan ne peut pas se déplacer.`
}

// Formate les messages Vapi en texte lisible pour la transcription
function formatTranscript(messages: Array<{ role: string; message?: string; content?: string }> | null | undefined): string | null {
  if (!messages || messages.length === 0) return null
  return messages
    .filter(m => m.role && (m.message || m.content))
    .map(m => {
      const isAgent = ['bot', 'assistant', 'agent', 'tool_call_result'].includes(m.role?.toLowerCase())
      const label = isAgent ? 'Agent' : 'Client'
      return `${label}: ${m.message || m.content}`
    })
    .join('\n') || null
}

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expiry: number } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { access_token: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000 }
  } catch { return null }
}

async function syncGoogleCalendar(artisanId: string, rdv: {
  clientName: string | null
  clientPhone: string | null
  reason: string | null
  appointmentDate: string
  appointmentTime: string | null
  companyName: string
}) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return

  const { data: p } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', artisanId)
    .single()

  if (!p?.google_access_token) return

  let accessToken = p.google_access_token

  // Renouveler le token si expiré
  if (p.google_token_expiry && Date.now() > p.google_token_expiry - 60_000) {
    if (!p.google_refresh_token) return
    const refreshed = await refreshGoogleToken(p.google_refresh_token)
    if (!refreshed) return
    accessToken = refreshed.access_token
    await supabase.from('profiles').update({
      google_access_token: refreshed.access_token,
      google_token_expiry: refreshed.expiry,
    }).eq('id', artisanId)
  }

  // Construire l'événement — on parse la date/heure brute de Mia
  const summary = rdv.clientName
    ? `RDV ${rdv.clientName}${rdv.reason ? ` — ${rdv.reason}` : ''}`
    : `RDV client${rdv.reason ? ` — ${rdv.reason}` : ''}`

  const description = [
    rdv.clientName ? `Client : ${rdv.clientName}` : null,
    rdv.clientPhone ? `Tél : ${rdv.clientPhone}` : null,
    rdv.reason ? `Motif : ${rdv.reason}` : null,
    `Pris par Mia (Fixlyy)`,
  ].filter(Boolean).join('\n')

  // Fallback : événement toute la journée si pas d'heure précise
  let eventBody: Record<string, unknown>
  const dateStr = rdv.appointmentDate // ex: "12 mai 2026" ou "2026-05-12"
  const timeStr = rdv.appointmentTime // ex: "10h30" ou "10:30" ou null

  // Tenter de construire une date ISO
  let startIso: string | null = null
  try {
    const frMonths: Record<string, string> = {
      janvier:'01',février:'02',mars:'03',avril:'04',mai:'05',juin:'06',
      juillet:'07',août:'08',septembre:'09',octobre:'10',novembre:'11',décembre:'12'
    }
    let normalized = dateStr.toLowerCase()
    for (const [fr, num] of Object.entries(frMonths)) normalized = normalized.replace(fr, num)
    const isoDate = normalized.match(/(\d{4})-(\d{2})-(\d{2})/)
      ? normalized.slice(0, 10)
      : (() => {
          const parts = normalized.match(/(\d{1,2})[\/\s-](\d{2})[\/\s-](\d{4})/)
          return parts ? `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}` : null
        })()
    if (isoDate && timeStr) {
      const timeParts = timeStr.match(/(\d{1,2})[h:](\d{0,2})/)
      const hh = timeParts ? timeParts[1].padStart(2, '0') : '09'
      const mm = timeParts ? (timeParts[2] || '00').padStart(2, '0') : '00'
      startIso = `${isoDate}T${hh}:${mm}:00`
    } else if (isoDate) {
      startIso = isoDate
    }
  } catch { /* silent */ }

  if (startIso && startIso.includes('T')) {
    const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString().slice(0, 19)
    eventBody = {
      summary,
      description,
      start: { dateTime: startIso, timeZone: 'Europe/Paris' },
      end:   { dateTime: endIso,   timeZone: 'Europe/Paris' },
    }
  } else if (startIso) {
    const nextDay = new Date(startIso)
    nextDay.setDate(nextDay.getDate() + 1)
    eventBody = {
      summary,
      description,
      start: { date: startIso },
      end:   { date: nextDay.toISOString().slice(0, 10) },
    }
  } else {
    return // Date non parseable, on abandonne silencieusement
  }

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    if (!res.ok) console.error('Google Calendar event failed:', await res.text())
  } catch (e: any) {
    console.error('Google Calendar sync error (non-blocking):', e.message)
  }
}

async function sendSms(from: string, to: string, body: string) {
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
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'SMS failed')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Vérification signature Vapi
  if (VAPI_WEBHOOK_SECRET) {
    const incoming = req.headers.get('x-vapi-secret')
    if (incoming !== VAPI_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  try {
    const payload = await req.json()
    const { message } = payload
    if (!message) return new Response('no message', { headers: cors })

    // ── assistant-request : injecter la date/heure Paris avant chaque appel ──
    if (message.type === 'assistant-request') {
      const assistantId = message.call?.assistantId
      const responseBody: Record<string, unknown> = {
        assistantOverrides: {
          model: { systemPromptSuffix: buildDateContext() },
        },
      }
      if (assistantId) responseBody.assistantId = assistantId
      return new Response(
        JSON.stringify(responseBody),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Seul le rapport de fin d'appel est traité ────────────────────────────
    if (message.type !== 'end-of-call-report') {
      return new Response('ignored', { headers: cors })
    }

    const assistantId = message.assistant?.id
    const durationSec = Math.round((message.durationMs || 0) / 1000)
    const callerNumber = message.customer?.number || 'Inconnu'
    const callId = message.call?.id || ''

    const structuredData = message.analysis?.structuredData || {}
    const callerName: string | null = structuredData.customerName || null
    const smsBody: string = structuredData.smsBody || ''
    const fullSummary: string = structuredData.fullSummary || ''
    const reason: string | null = structuredData.reason || smsBody || null
    const clientTone: string | null              = structuredData.clientTone || null
    const aiToneUsed: string | null              = structuredData.aiToneUsed || null
    const qualityScore: number | null            = structuredData.conversationQualityScore ?? null
    const qualityNotes: string | null            = structuredData.conversationQualityNotes || null
    const appointmentDate: string | null         = structuredData.appointmentDate || null
    const appointmentTime: string | null         = structuredData.appointmentTime || null

    // Transcription depuis artifact.messages
    const transcript: string | null = formatTranscript(message.artifact?.messages) || message.artifact?.transcript || null

    if (!assistantId || (!smsBody && !fullSummary)) {
      return new Response('no summary', { headers: cors })
    }

    // Trouver l'artisan par vapi_assistant_id (maybeSingle pour éviter un crash si doublon résiduel)
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, phone, twilio_number, assistant_name, company_name')
      .eq('vapi_assistant_id', assistantId)
      .limit(2)

    if (profileErr) {
      console.error('profiles query error:', profileErr.message)
      return new Response('db error', { status: 500, headers: cors })
    }

    if (!profiles || profiles.length === 0) {
      console.error('No profile for assistant:', assistantId)
      // Alerte critique : assistant sans artisan — configuration invalide
      await supabase.from('critical_alerts').insert({
        alert_type: 'orphan_assistant',
        severity: 'high',
        message: `Webhook reçu pour assistant ${assistantId} sans profil artisan correspondant`,
        meta: { assistant_id: assistantId, call_id: callId },
      })
      return new Response('no profile', { status: 404, headers: cors })
    }

    if (profiles.length > 1) {
      console.error('Multiple profiles share assistant:', assistantId, '— IDs:', profiles.map(p => p.id))
      // Alerte critique : assistant partagé — exécuter fix-shared-vapi-assistants.ts
      await supabase.from('critical_alerts').insert({
        alert_type: 'shared_assistant',
        severity: 'critical',
        message: `${profiles.length} artisans partagent l'assistant ${assistantId} — SMS non envoyé, migration requise`,
        meta: { assistant_id: assistantId, user_ids: profiles.map(p => p.id) },
      })
      return new Response('ambiguous profile', { status: 409, headers: cors })
    }

    const profile = profiles[0]

    if (!profile?.phone || !profile?.twilio_number) {
      console.error('No phone or twilio_number for assistant:', assistantId)
      return new Response('no profile', { headers: cors })
    }

    // ── Auto-création/mise à jour de contact si nom connu ───────────────────
    if (callerName) {
      try {
        const phoneKnown = callerNumber && callerNumber !== 'Inconnu'
        if (phoneKnown) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('user_id', profile.id)
            .eq('phone', callerNumber)
            .maybeSingle()

          if (!existing) {
            await supabase.from('contacts').insert({ user_id: profile.id, name: callerName, phone: callerNumber })
          } else if (!existing.name && callerName) {
            await supabase.from('contacts').update({ name: callerName }).eq('id', existing.id)
          }
        }
        // Si numéro inconnu mais nom connu : on met à jour le call record uniquement (pas de contact sans téléphone)
      } catch (e: any) {
        console.error('auto-contact failed (non-blocking):', e.message)
      }
    }

    // ── SMS : accroche courte + résumé structuré 3 phrases ──────────────────
    const smsParts: string[] = []
    smsParts.push(smsBody || '[Résumé indisponible]')
    if (fullSummary) {
      smsParts.push('')
      smsParts.push(fullSummary)
    }
    smsParts.push(`– ${profile.assistant_name || 'Mia'}, réceptionniste Fixlyy`)
    const smsText = smsParts.join('\n')

    await sendSms(profile.twilio_number, profile.phone, smsText)

    // ── Sauvegarde en base ───────────────────────────────────────────────────
    await supabase.from('calls').insert({
      artisan_id: profile.id,
      caller_phone: callerNumber,
      caller_name: callerName,
      duration_seconds: durationSec,
      summary: fullSummary || smsBody || null,
      sms_body: smsBody || null,
      reason,
      status: 'new',
      vapi_call_id: callId,
      transcript,
      client_tone: clientTone,
      ai_tone_used: aiToneUsed,
      conversation_quality_score: qualityScore,
      conversation_quality_notes: qualityNotes,
    })

    // ── Création automatique du RDV si Mia a collecté une date ──────────────
    if (appointmentDate) {
      try {
        await supabase.from('appointments').insert({
          artisan_id: profile.id,
          client_name: callerName,
          client_phone: callerNumber !== 'Inconnu' ? callerNumber : null,
          reason,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime || 'À confirmer',
          status: 'pending',
          vapi_call_id: callId,
        })

        // ── Sync Google Calendar si l'artisan a connecté son compte ──────────
        await syncGoogleCalendar(profile.id, {
          clientName: callerName,
          clientPhone: callerNumber !== 'Inconnu' ? callerNumber : null,
          reason,
          appointmentDate,
          appointmentTime: appointmentTime || null,
          companyName: profile.company_name,
        })
      } catch (e: any) {
        console.error('appointment insert failed (non-blocking):', e.message)
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('send-call-sms error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

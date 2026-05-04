import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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

  try {
    const payload = await req.json()
    // Vapi webhook payload : message.type === 'end-of-call-report'
    const { message } = payload
    if (!message || message.type !== 'end-of-call-report') {
      return new Response('ignored', { headers: cors })
    }

    const assistantId = message.assistant?.id
    const durationSec = Math.round((message.durationMs || 0) / 1000)
    const callerNumber = message.customer?.number || 'Inconnu'
    const callId = message.call?.id || ''

    // structuredData fields are filled by the assistant in French (per prompt instructions)
    const structuredData = message.analysis?.structuredData || {}
    const callerName: string | null = structuredData.customerName || null
    // smsBody is always in French (set in the assistant's prompt)
    // fall back to auto-generated summary if smsBody not populated
    const smsSummary: string = structuredData.smsBody || message.analysis?.summary || message.summary || ''
    // reason = why the caller contacted (French if structuredData, otherwise summary)
    const reason: string | null = structuredData.reason || structuredData.smsBody || message.analysis?.summary || null
    // Qualité conversationnelle (nouveaux champs — null si ancien assistant non mis à jour)
    const clientTone: string | null              = structuredData.clientTone || null
    const aiToneUsed: string | null              = structuredData.aiToneUsed || null
    const qualityScore: number | null            = structuredData.conversationQualityScore ?? null
    const qualityNotes: string | null            = structuredData.conversationQualityNotes || null

    if (!assistantId || !smsSummary) {
      return new Response('no summary', { headers: cors })
    }

    // Find artisan by vapi_assistant_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, phone, twilio_number, assistant_name, company_name')
      .eq('vapi_assistant_id', assistantId)
      .single()

    if (!profile?.phone || !profile?.twilio_number) {
      console.error('No phone or twilio_number for assistant:', assistantId)
      return new Response('no profile', { headers: cors })
    }

    // Ensure Vapi analysisPlan generates summaries in French (one-time silent patch)
    if (VAPI_API_KEY) {
      try {
        const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
        })
        if (getRes.ok) {
          const assistant = await getRes.json()
          const existingPlan = assistant.analysisPlan?.summaryPlan?.prompt || ''
          if (!existingPlan.includes('français')) {
            await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                analysisPlan: {
                  summaryPlan: {
                    prompt: "Rédige un résumé concis en français de cet appel. Indique : (1) la raison de l'appel, (2) les informations importantes mentionnées (nom, téléphone, adresse si donné), (3) si c'est urgent ou non, (4) la prochaine action à faire. Maximum 3 phrases. Réponds UNIQUEMENT en français.",
                  },
                },
              }),
            })
          }
        }
      } catch (e) {
        console.error('analysisPlan patch failed (non-blocking):', e)
      }
    }

    // Build SMS
    const mins = Math.floor(durationSec / 60)
    const secs = durationSec % 60
    const duration = mins > 0 ? `${mins}min${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`

    const callerLabel = callerName ? `${callerName} (${callerNumber})` : callerNumber
    const smsBody = [
      `📞 Appel reçu (${duration}) — ${callerLabel}`,
      ``,
      smsSummary,
      ``,
      `— ${profile.assistant_name || 'Votre assistante'} · Fixlyy`,
    ].join('\n')

    await sendSms(profile.twilio_number, profile.phone, smsBody)

    // Save call to DB (columns match CallRow type in Dashboard.tsx)
    await supabase.from('calls').insert({
      artisan_id: profile.id,
      caller_phone: callerNumber,
      caller_name: callerName,
      duration_seconds: durationSec,
      summary: smsSummary,
      reason,
      status: 'new',
      vapi_call_id: callId,
      client_tone: clientTone,
      ai_tone_used: aiToneUsed,
      conversation_quality_score: qualityScore,
      conversation_quality_notes: qualityNotes,
    }).select()

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

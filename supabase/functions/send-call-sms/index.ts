import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)

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
    const summary = message.analysis?.summary || message.summary || ''
    const durationSec = Math.round((message.durationMs || 0) / 1000)
    const callerNumber = message.customer?.number || 'Inconnu'
    const callId = message.call?.id || ''

    if (!assistantId || !summary) {
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

    // Build SMS
    const mins = Math.floor(durationSec / 60)
    const secs = durationSec % 60
    const duration = mins > 0 ? `${mins}min${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`

    const smsBody = [
      `📞 Appel reçu (${duration}) — ${callerNumber}`,
      ``,
      summary,
      ``,
      `— ${profile.assistant_name || 'Votre assistante'} · Fixlyy`,
    ].join('\n')

    await sendSms(profile.twilio_number, profile.phone, smsBody)

    // Save call to DB
    await supabase.from('calls').insert({
      artisan_id: profile.id,
      caller_number: callerNumber,
      duration_seconds: durationSec,
      summary,
      vapi_call_id: callId,
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

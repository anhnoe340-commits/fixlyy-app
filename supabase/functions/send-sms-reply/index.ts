import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_AUTH = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const ip = getClientIp(req)
  if (!checkRateLimit(ip, 'sms-reply', 10, 60_000)) return TOO_MANY_REQUESTS(CORS)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    const { conversation_id, message } = await req.json()
    if (!conversation_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'conversation_id and message required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Fetch conversation (RLS ensures ownership)
    const { data: conv, error: convError } = await supabaseUser
      .from('sms_conversations')
      .select('id, artisan_id, client_phone, messages')
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: 'conversation not found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Fetch artisan's Twilio number
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('twilio_number')
      .eq('id', user.id)
      .single()

    if (!profile?.twilio_number) {
      return new Response(JSON.stringify({ error: 'no twilio_number on profile' }), {
        status: 422, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Send SMS via Twilio
    const form = new URLSearchParams({
      From: profile.twilio_number,
      To: conv.client_phone,
      Body: message.trim(),
    })

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${TWILIO_AUTH}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    )

    if (!twilioRes.ok) {
      const err = await twilioRes.text()
      console.error('Twilio error:', err)
      return new Response(JSON.stringify({ error: 'twilio_send_failed', detail: err }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Append artisan message to conversation
    const updatedMessages = [
      ...(conv.messages as { role: string; content: string }[]),
      { role: 'artisan', content: message.trim() },
    ]

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('sms_conversations')
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq('id', conversation_id)
      .select()
      .single()

    if (updateError) throw updateError

    await logEvent({
      supabase: supabaseAdmin,
      eventType: 'sms_reply_sent',
      userId: user.id,
      resourceType: 'sms_conversation',
      resourceId: conversation_id,
      metadata: { client_phone: conv.client_phone, message_length: message.trim().length },
    })

    return new Response(JSON.stringify(updated), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    console.error('send-sms-reply error:', err.message ?? err)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})

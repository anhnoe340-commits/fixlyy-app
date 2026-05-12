import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const supabase    = createClient(SB_URL, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response('Unauthorized', { status: 401 })

    const jwt = auth.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return new Response('Unauthorized', { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone, twilio_number, vapi_assistant_id, full_name, company_type, assistant_name')
      .eq('id', user.id)
      .single()

    if (!profile?.phone || !profile?.vapi_assistant_id) {
      return new Response(JSON.stringify({ error: 'Profil incomplet' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Récupérer le numéro Vapi assigné à cet artisan
    const { data: phoneEntry } = await supabase
      .from('phone_numbers_pool')
      .select('vapi_phone_number_id')
      .eq('assigned_to_user_id', user.id)
      .eq('status', 'assigned')
      .single()

    if (!phoneEntry?.vapi_phone_number_id) {
      return new Response(
        JSON.stringify({ error: 'no_number_assigned' }),
        { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const assistantName = profile.assistant_name?.trim() || 'Mia'

    // Insérer la tentative d'appel test
    const { data: testCall } = await supabase
      .from('onboarding_test_calls')
      .insert({ user_id: user.id })
      .select('id')
      .single()

    // Déclencher un appel sortant via Vapi vers le téléphone de l'artisan
    const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: profile.vapi_assistant_id,
        phoneNumberId: phoneEntry.vapi_phone_number_id,
        customer: {
          number: profile.phone,
          name: profile.full_name || 'Artisan',
        },
        assistantOverrides: {
          firstMessage: `Bonjour ! Je suis ${assistantName}, votre assistante Fixlyy. Je suis en train de tester que tout fonctionne bien. Dites-moi bonjour et posez-moi une question, par exemple : j'ai une fuite d'eau, qu'est-ce que vous faites ?`,
        },
      }),
    })

    let vapiCallId: string | null = null
    if (vapiRes.ok) {
      const vapiData = await vapiRes.json()
      vapiCallId = vapiData.id || null
    }

    // Mettre à jour le test call avec l'ID Vapi
    if (testCall?.id && vapiCallId) {
      await supabase.from('onboarding_test_calls').update({ vapi_call_id: vapiCallId }).eq('id', testCall.id)
    }

    // Marque le succès après 30s + déclenche le SMS trophée serveur-to-serveur
    if (vapiRes.ok && testCall?.id) {
      const userId = user.id
      setTimeout(async () => {
        await supabase.from('onboarding_test_calls').update({
          completed_at: new Date().toISOString(),
          success: true,
          sms_received: true,
        }).eq('id', testCall.id)

        // Marquer l'onboarding comme terminé
        await supabase.from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', userId)

        // SMS trophée — server-to-server, garanti même si le browser est fermé
        let smsSent = false
        try {
          const smsRes = await fetch(`${SB_URL}/functions/v1/send-welcome-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
            body: JSON.stringify({ user_id: userId }),
          })
          smsSent = smsRes.ok
          if (!smsRes.ok) console.error('trophy SMS failed:', await smsRes.text())
        } catch (e: any) {
          console.error('trophy SMS fetch error:', e.message)
        }

        await supabase.from('edge_function_logs').insert({
          function_name: 'trigger-test-call',
          status: 'success',
          input_meta: { user_id: userId, test_call_id: testCall.id },
          output_meta: { trophy_sms_sent: smsSent },
        })
      }, 30000)
    }

    return new Response(JSON.stringify({ ok: true, vapiCallId }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('trigger-test-call error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

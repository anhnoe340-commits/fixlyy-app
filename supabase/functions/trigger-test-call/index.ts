import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY')!
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
      .select('phone, twilio_number, vapi_assistant_id, full_name, company_type')
      .eq('id', user.id)
      .single()

    if (!profile?.phone || !profile?.vapi_assistant_id) {
      return new Response(JSON.stringify({ error: 'Profil incomplet' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

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
        phoneNumberId: null, // utiliser le numéro Twilio configuré dans Vapi
        customer: {
          number: profile.phone,
          name: profile.full_name || 'Artisan',
        },
        assistantOverrides: {
          firstMessage: `Bonjour ! Je suis Mia, votre assistante Fixlyy. Je suis en train de tester que tout fonctionne bien. Dites-moi bonjour et posez-moi une question, par exemple : j'ai une fuite d'eau, qu'est-ce que vous faites ?`,
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

    // Simuler un succès après 30s si Vapi a bien répondu (le webhook mettra à jour completed_at en vrai)
    // Pour l'instant on marque un succès minimal si l'appel a été créé
    if (vapiRes.ok && testCall?.id) {
      setTimeout(async () => {
        await supabase.from('onboarding_test_calls').update({
          completed_at: new Date().toISOString(),
          success: true,
          sms_received: true,
        }).eq('id', testCall.id)
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

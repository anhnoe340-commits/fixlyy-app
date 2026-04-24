import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function normalizePhone(p: string): string {
  const digits = p.replace(/[\s\-\.]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return '+33' + digits.slice(1)
  return '+33' + digits
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  let body: { transfer_enabled: boolean; transfer_phone: string }
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { transfer_enabled, transfer_phone } = body

  // Récupérer le profil
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('vapi_assistant_id, phone, assistant_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.vapi_assistant_id) {
    return new Response(
      JSON.stringify({ error: 'Assistant VAPI introuvable. Complétez d\'abord votre onboarding.' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const vapiKey = Deno.env.get('VAPI_API_KEY')
  if (!vapiKey) {
    return new Response(
      JSON.stringify({ error: 'VAPI_API_KEY non configuré' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const assistantId = profile.vapi_assistant_id
  const phoneToUse = transfer_phone || profile.phone

  // ── GET current assistant config ────────────────────────────────────────────
  const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: { 'Authorization': `Bearer ${vapiKey}` },
  })
  if (!getRes.ok) {
    const err = await getRes.text()
    console.error('VAPI GET error:', err)
    return new Response(
      JSON.stringify({ error: 'Impossible de récupérer l\'assistant VAPI' }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
  const assistant = await getRes.json()

  // Retirer tout transferCall existant
  const currentTools: any[] = (assistant.model?.tools ?? []).filter(
    (t: any) => t.type !== 'transferCall'
  )

  // Ajouter le nouveau si activé
  let newTools = currentTools
  if (transfer_enabled && phoneToUse) {
    const e164 = normalizePhone(phoneToUse)
    const assistantName = profile.assistant_name || 'votre assistante'
    newTools = [
      ...currentTools,
      {
        type: 'transferCall',
        destinations: [
          {
            type: 'number',
            number: e164,
            message: `Je vous mets en relation avec votre artisan. Restez en ligne s'il vous plaît.`,
          },
        ],
        function: {
          name: 'transfer_to_artisan',
          description:
            "Transférer l'appel EN DIRECT vers l'artisan uniquement si : (1) le client insiste absolument pour parler à un humain après plusieurs refus, OU (2) c'est une urgence qui met des vies en danger (fuite de gaz, inondation majeure, électricité coupée en hiver). " +
            "Dans tous les autres cas, prends le message et envoie un résumé par SMS. " +
            "Avant de transférer, dis toujours : 'Je vous mets en relation avec votre artisan. Restez en ligne.'",
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
    ]
  }

  // ── PATCH VAPI assistant ─────────────────────────────────────────────────────
  const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${vapiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: {
        ...assistant.model,
        tools: newTools,
      },
    }),
  })

  if (!patchRes.ok) {
    const err = await patchRes.text()
    console.error('VAPI PATCH error:', err)
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la mise à jour de l\'assistant VAPI' }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  // ── Sauvegarder dans profiles ────────────────────────────────────────────────
  await supabase.from('profiles').update({
    transfer_phone: transfer_enabled && phoneToUse ? normalizePhone(phoneToUse) : null,
  }).eq('id', user.id)

  return new Response(
    JSON.stringify({ success: true, transfer_enabled, phone: transfer_enabled && phoneToUse ? normalizePhone(phoneToUse) : null }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
})

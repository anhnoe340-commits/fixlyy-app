import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const VAPI_KEY   = Deno.env.get('VAPI_API_KEY')!

// Assistant Mia configuré comme réceptionniste (prompt inbound normal)
const MIA_ASSISTANT_ID = Deno.env.get('VAPI_DEFAULT_ASSISTANT_ID') ?? '952f1509-ff70-4b5d-aeb0-eb2c1a050c78'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEMO_COMPANIES: Record<string, { name: string; type: string }> = {
  plombier:     { name: 'Plomberie Martin',           type: 'plombier / chauffagiste' },
  chauffagiste: { name: 'Chauffage & Plomberie Martin', type: 'plombier / chauffagiste' },
  electricien:  { name: 'Électricité Dupont',          type: 'électricien' },
  serrurier:    { name: 'Serrurerie Express',           type: 'serrurier' },
  menuisier:    { name: 'Menuiserie Lebrun',            type: 'menuisier' },
  peintre:      { name: 'Peinture & Déco Moreau',      type: 'peintre / plâtrier' },
  autre:        { name: 'Artisan Services',             type: 'artisan' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  const ip = getClientIp(req)
  if (!checkRateLimit(`demo:${ip}`, 3, 3600000)) {
    return TOO_MANY_REQUESTS(cors)
  }

  let body: { phone?: string; email?: string; metier?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const phone  = (body.phone  ?? '').trim()
  const email  = (body.email  ?? '').trim().toLowerCase()
  const metier = (body.metier ?? 'autre').trim()

  if (!/^\+33[67]\d{8}$/.test(phone)) {
    return new Response(JSON.stringify({ error: 'invalid_phone', message: 'Numéro français mobile attendu (+33 6/7 XX XX XX XX)' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (!email.includes('@') || !email.includes('.')) {
    return new Response(JSON.stringify({ error: 'invalid_email' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SB_URL, SB_SERVICE)

  // Stocker le lead (non-bloquant)
  supabase.from('demo_leads').insert({ phone, email, metier, ip }).then(() => {}).catch(() => {})

  // Numéro sortant depuis le pool
  const { data: poolEntry } = await supabase
    .from('phone_numbers_pool')
    .select('vapi_phone_number_id, phone_number')
    .not('status', 'eq', 'quarantine')
    .not('vapi_phone_number_id', 'is', null)
    .limit(1)
    .single()

  if (!poolEntry?.vapi_phone_number_id) {
    console.error('[demo-call] Aucun numéro Vapi disponible dans le pool')
    return new Response(JSON.stringify({ error: 'no_number', message: 'Service temporairement indisponible. Réessayez.' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const company = DEMO_COMPANIES[metier] ?? DEMO_COMPANIES['autre']

  // Mia répond comme réceptionniste — exactement comme pour un vrai appel client
  // Si l'appelant demande "c'est quoi Fixlyy ?" → Mia explique naturellement
  const firstMessage = `${company.name}, bonjour ! Comment puis-je vous aider ?`

  const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId:   MIA_ASSISTANT_ID,
      phoneNumberId: poolEntry.vapi_phone_number_id,
      customer:      { number: phone },
      assistantOverrides: {
        firstMessage,
      },
    }),
  })

  if (!vapiRes.ok) {
    const err = await vapiRes.text().catch(() => '')
    console.error('[demo-call] Vapi error:', vapiRes.status, err)
    return new Response(JSON.stringify({ error: 'call_failed', message: 'Impossible de déclencher l\'appel. Réessayez.' }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const vapiData = await vapiRes.json()
  console.log(`[demo-call] Appel déclenché : ${phone} (${company.name}) callId=${vapiData.id}`)

  // Mettre à jour le lead avec l'ID d'appel
  supabase.from('demo_leads').update({ vapi_call_id: vapiData.id }).eq('phone', phone).eq('email', email).then(() => {}).catch(() => {})

  return new Response(JSON.stringify({ ok: true, callId: vapiData.id }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})

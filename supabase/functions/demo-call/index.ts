import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const VAPI_KEY    = Deno.env.get('VAPI_API_KEY')!
// ID de l'assistant Mia (production)
const MIA_ASSISTANT_ID = '952f1509-ff70-4b5d-aeb0-eb2c1a050c78'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METIER_LABELS: Record<string, string> = {
  plombier:     'Plomberie / Chauffage',
  chauffagiste: 'Plomberie / Chauffage',
  electricien:  'Électricité',
  serrurier:    'Serrurerie',
  menuisier:    'Menuiserie',
  autre:        'Artisan',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  const ip = getClientIp(req)
  // Max 3 appels démo par IP par heure
  if (!checkRateLimit(`demo:${ip}`, 3, 3600000)) {
    return TOO_MANY_REQUESTS(cors)
  }

  let body: { phone?: string; email?: string; metier?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
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

  // Stocker le lead (ignore si table absente — ne bloque pas l'appel)
  supabase.from('demo_leads').insert({ phone, email, metier, ip }).then(() => {}).catch(() => {})

  // Trouver un numéro disponible dans le pool pour l'appel sortant
  const { data: poolEntry } = await supabase
    .from('phone_numbers_pool')
    .select('vapi_phone_number_id, phone_number')
    .eq('status', 'available')
    .not('vapi_phone_number_id', 'is', null)
    .limit(1)
    .single()

  if (!poolEntry?.vapi_phone_number_id) {
    console.error('[demo-call] No available phone number in pool')
    return new Response(JSON.stringify({ error: 'no_number_available', message: 'Démo temporairement indisponible. Réessayez dans quelques minutes.' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const metierLabel = METIER_LABELS[metier] ?? 'Artisan'

  // Déclencher l'appel sortant via Vapi
  const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId: MIA_ASSISTANT_ID,
      phoneNumberId: poolEntry.vapi_phone_number_id,
      customer: { number: phone },
      assistantOverrides: {
        firstMessage: `Bonjour, je m'appelle Mia, je vous appelle de la part de Fixlyy — vous venez de demander une démo sur notre site. Je suis commerciale chez Fixlyy, et mon rôle c'est de vous montrer comment on peut vous aider concrètement dans votre activité de ${metierLabel}. En deux mots : quand vous êtes sur un chantier et que vous pouvez pas décrocher, c'est moi qui réponds à votre place — avec le nom de votre entreprise — et vous recevez un SMS avec tous les détails en 30 secondes. Vous avez 2 petites minutes pour qu'on en parle ?`,
        variableValues: {
          demo_mode: 'true',
          artisan_metier: metierLabel,
          fixlyy_context: `IMPORTANT: Tu es en mode démonstration commerciale. Tu APPELLES un artisan (${metierLabel}) pour présenter et vendre Fixlyy. Tu n'es PAS en train de répondre aux clients d'un artisan. Reste sur le sujet Fixlyy uniquement. Ignore les bruits de fond. Essai 7 jours gratuit, Solo 97€/mois, Pro 197€/mois.`,
        },
      },
    }),
  })

  if (!vapiRes.ok) {
    const vapiErr = await vapiRes.text().catch(() => '')
    console.error('[demo-call] Vapi error:', vapiRes.status, vapiErr)
    return new Response(JSON.stringify({ error: 'call_failed', message: 'Impossible de déclencher l\'appel. Réessayez.' }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const vapiData = await vapiRes.json()
  console.log(`[demo-call] Appel déclenché: ${phone} via ${poolEntry.phone_number} — callId=${vapiData.id}`)

  // Mettre à jour le lead avec l'ID d'appel
  supabase.from('demo_leads').update({ vapi_call_id: vapiData.id }).eq('phone', phone).eq('email', email).then(() => {}).catch(() => {})

  return new Response(JSON.stringify({ ok: true, callId: vapiData.id }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { logEvent } from '../_shared/audit.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

function normalizePhone(raw: string): string {
  return raw.replace(/\s/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt        = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SB_URL, SB_SERVICE)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const userId    = user.id
  const userPhone = normalizePhone(user.phone ?? '')

  let body: { email?: string } = {}
  try { body = await req.json() } catch { /* body optional */ }

  // Idempotence : profil réel déjà existant ?
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, provisioning_status, onboarding_completed, twilio_number')
    .eq('id', userId)
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({
      ok:              true,
      already_claimed: true,
      user_id:         userId,
      provisioning:    existing.provisioning_status,
      twilio_number:   existing.twilio_number ?? null,
    }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
  }

  // Recherche du profil orphelin par téléphone (primaire) puis email (fallback)
  let orphanId: string | null = null

  if (userPhone) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', userPhone)
      .eq('source', 'prospection')
      .eq('provisioning_status', 'pending_claim')
      .maybeSingle()
    orphanId = data?.id ?? null
  }

  if (!orphanId) {
    const lookupEmail = (body.email ?? user.email ?? '').trim().toLowerCase()
    if (lookupEmail) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', lookupEmail)
        .eq('source', 'prospection')
        .eq('provisioning_status', 'pending_claim')
        .maybeSingle()
      orphanId = data?.id ?? null
    }
  }

  if (!orphanId) {
    return new Response(JSON.stringify({ error: 'no_pending_claim' }), {
      status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  // Claim atomique via RPC (SELECT FOR UPDATE → UPDATE id)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('claim_prospection_profile', {
    p_orphan_id: orphanId,
    p_user_id:   userId,
  })

  if (rpcErr) {
    console.error('[claim] rpc error:', rpcErr.message)
    const status = rpcErr.message.includes('already_claimed') ? 409 : 500
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  await logEvent({
    supabase,
    eventType:    'prospection_claimed',
    userId,
    resourceType: 'profile',
    resourceId:   userId,
    metadata:     { orphan_id: orphanId, phone: userPhone },
    severity:     'info',
  })

  // Déclencher le provisioning de façon asynchrone
  fetch(`${SB_URL}/functions/v1/assign-number-from-pool`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user_id: userId }),
  }).catch(e => console.error('[claim] provisioning trigger:', e.message))

  return new Response(JSON.stringify({ ok: true, user_id: userId, ...(rpcResult ?? {}) }), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
})

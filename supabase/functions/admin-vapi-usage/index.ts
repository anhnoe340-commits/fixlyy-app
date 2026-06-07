import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE    = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const VAPI_API_KEY  = Deno.env.get('VAPI_API_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const ADMIN_UID     = Deno.env.get('ADMIN_USER_ID')!

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID  = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const isStr   = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Auth — admin uniquement
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user || user.id !== ADMIN_UID) {
    return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vide */ }

  const action = (body.action as string) ?? 'costs'

  // ── Action : vérifier si un assistant Vapi existe ────────────────────────
  if (action === 'check_assistant') {
    const assistantId = body.assistant_id
    if (!isUUID(assistantId)) {
      return new Response(JSON.stringify({ error: 'assistant_id must be a valid UUID' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    })
    return new Response(JSON.stringify({ exists: res.ok, http_status: res.status }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // ── Action : bloquer un essai abusif ────────────────────────────────────
  if (action === 'block_trial') {
    const targetUserId = body.user_id
    if (!isUUID(targetUserId)) {
      return new Response(JSON.stringify({ error: 'user_id must be a valid UUID' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date().toISOString()
    await supabaseAdmin.from('profiles').update({
      trial_status: 'blocked',
      trial_ends_at: now,
    }).eq('id', targetUserId)

    await supabaseAdmin.from('trial_fingerprints').update({
      is_suspicious: true,
      suspicious_reason: 'Essai bloqué manuellement par admin',
    }).eq('user_id', targetUserId)

    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('company_name')
      .eq('id', targetUserId)
      .maybeSingle()

    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
    const targetEmail = authUser?.email

    if (targetEmail && RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Fixlyy <noreply@fixlyy.fr>',
          to: targetEmail,
          subject: "Votre essai Fixlyy n'a pas pu être activé",
          html: `<p>Bonjour${profileRow?.company_name ? ` ${profileRow.company_name}` : ''},</p>
<p>Votre essai gratuit n'a pas pu être activé suite à une vérification de notre part.</p>
<p>Si vous pensez qu'il s'agit d'une erreur, contactez-nous : <a href="mailto:support@fixlyy.fr">support@fixlyy.fr</a></p>
<p>L'équipe Fixlyy</p>`,
        }),
      })
    }

    return new Response(JSON.stringify({ ok: true, blocked_user: targetUserId }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // ── Action : coûts réels Vapi pour un assistant ce mois ─────────────────
  const assistantId = body.assistant_id
  const monthStart  = body.month_start

  if (!isUUID(assistantId)) {
    return new Response(JSON.stringify({ error: 'assistant_id must be a valid UUID' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (!isStr(monthStart) || isNaN(Date.parse(monthStart as string))) {
    return new Response(JSON.stringify({ error: 'month_start must be a valid ISO date string' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const params = new URLSearchParams({
    assistantId,
    createdAtGt: monthStart,
    limit: '1000',
  })

  let calls: any[] = []
  try {
    const vapiRes = await fetch(`https://api.vapi.ai/call?${params}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    })
    if (vapiRes.ok) {
      const raw = await vapiRes.json()
      // Vapi peut retourner un tableau direct ou { results: [] } selon la version
      const allCalls = Array.isArray(raw) ? raw : (raw.results ?? raw.data ?? raw.calls ?? [])
      // Filtrage local défensif : s'assurer que seuls les appels de cet assistant sont retournés
      calls = allCalls.filter((c: any) => !c.assistantId || c.assistantId === assistantId)
    } else {
      console.error('[admin-vapi-usage] Vapi API error:', vapiRes.status, await vapiRes.text())
    }
  } catch (e) {
    console.error('[admin-vapi-usage] fetch error:', e)
  }

  const total_cost             = calls.reduce((s: number, c: any) => s + (c.cost ?? 0), 0)
  const total_duration_seconds = calls.reduce((s: number, c: any) => s + (c.duration ?? c.durationSeconds ?? 0), 0)

  return new Response(JSON.stringify({
    total_cost:             Math.round(total_cost * 10000) / 10000,
    total_calls:            calls.length,
    total_duration_seconds,
    calls: calls.map((c: any) => ({
      id:        c.id,
      cost:      c.cost ?? 0,
      duration:  c.duration ?? c.durationSeconds ?? 0,
      createdAt: c.createdAt,
    })),
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})

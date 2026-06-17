import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

// Miroir minimal de plans.ts — synchroniser si les tarifs changent
const PLAN_MINUTES: Record<string, number> = { solo: 300, pro: 500, max: 1000 }
const PLAN_OVERAGE: Record<string, number> = { solo: 0.25, pro: 0.25, max: 0.20 }

function normalizePlan(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase()
  if (s === 'pro') return 'pro'
  if (s === 'max' || s.includes('equipe') || s.includes('expert') || s.includes('team')) return 'max'
  return 'solo'
}

const cors = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return new Response('Unauthorized', { status: 401, headers: cors })

  const supabase = createClient(SB_URL, SB_SERVICE)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: cors })

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscription_plan, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'profile_not_found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const plan        = normalizePlan(profile.subscription_plan)
    const quota       = PLAN_MINUTES[plan]
    const overageRate = PLAN_OVERAGE[plan]

    // Mois calendaire — bornes en UTC
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth()
    const startIso = new Date(year, month, 1).toISOString()
    const endIso   = new Date(year, month + 1, 1).toISOString()

    const periodStart = new Date(year, month, 1).toISOString().split('T')[0]

    // periodEnd : current_period_end Stripe si disponible, sinon dernier jour du mois
    let periodEnd = new Date(year, month + 1, 0).toISOString().split('T')[0]
    if (profile.stripe_customer_id) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('current_period_end')
        .eq('stripe_customer_id', profile.stripe_customer_id)
        .in('status', ['trialing', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sub?.current_period_end) {
        periodEnd = sub.current_period_end.split('T')[0]
      }
    }

    // get_monthly_minutes gère la TZ Europe/Paris (cohérent avec la vue monthly_minutes)
    const [minutesRes, countRes] = await Promise.all([
      supabase.rpc('get_monthly_minutes', { p_user_id: profile.id }),
      supabase.from('calls')
        .select('*', { count: 'exact', head: true })
        .eq('artisan_id', profile.id)
        .gte('created_at', startIso)
        .lt('created_at', endIso),
    ])

    const minutesUsed      = (minutesRes.data as number | null) ?? 0
    const callsCount        = countRes.count ?? 0
    const minutesRemaining  = Math.max(0, quota - minutesUsed)
    const overageMinutes    = Math.max(0, minutesUsed - quota)
    const overageAmountEur  = Math.round(overageMinutes * overageRate * 100) / 100

    return new Response(JSON.stringify({
      minutes_used:       minutesUsed,
      minutes_quota:      quota,
      minutes_remaining:  minutesRemaining,
      overage_minutes:    overageMinutes,
      overage_amount_eur: overageAmountEur,
      overage_rate:       overageRate,
      period_start:       periodStart,
      period_end:         periodEnd,
      calls_count:        callsCount,
      plan,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (e: any) {
    console.error('[get-usage] error:', e.message)
    return new Response(JSON.stringify({ error: 'internal_server_error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

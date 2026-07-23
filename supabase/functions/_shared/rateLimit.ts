import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Store partagé (table Postgres public.rate_limits + RPC check_rate_limit,
// upsert atomique) — un Map en mémoire ne persiste pas entre invocations
// d'edge functions Supabase (pas d'affinité d'instance garantie), ce qui
// laissait passer toutes les requêtes en prod malgré la limite déclarée.
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!,
)

// Supports 3-arg form (ip, maxRequests, windowMs) et 4-arg form (ip, key, maxRequests, windowMs)
export async function checkRateLimit(
  ip: string,
  keyOrMax: string | number,
  maxOrWindow?: number,
  windowMs?: number,
): Promise<boolean> {
  const isKeyed = typeof keyOrMax === 'string'
  const key           = isKeyed ? `${ip}:${keyOrMax}` : ip
  const max           = isKeyed ? (maxOrWindow ?? 10)  : (keyOrMax as number)
  const windowSeconds = Math.max(1, Math.round((isKeyed ? (windowMs ?? 60000) : (maxOrWindow ?? 60000)) / 1000))

  const { data, error } = await sb.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('[rateLimit] check_rate_limit RPC error:', error.message)
    return true // fail-open : un incident DB ne doit pas bloquer le trafic légitime
  }

  return data as boolean
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

export const TOO_MANY_REQUESTS = (cors: Record<string, string> = {}) =>
  new Response('Too Many Requests', {
    status: 429,
    headers: { ...cors, 'Retry-After': '60' },
  })

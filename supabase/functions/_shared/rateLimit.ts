const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Supports 3-arg form (ip, maxRequests, windowMs) and 4-arg form (ip, key, maxRequests, windowMs)
export function checkRateLimit(
  ip: string,
  keyOrMax: string | number,
  maxOrWindow?: number,
  windowMs?: number,
): boolean {
  const isKeyed = typeof keyOrMax === 'string'
  const mapKey   = isKeyed ? `${ip}:${keyOrMax}` : ip
  const max      = isKeyed ? (maxOrWindow ?? 10)  : (keyOrMax as number)
  const window   = isKeyed ? (windowMs ?? 60000)  : (maxOrWindow ?? 60000)

  const now   = Date.now()
  const entry = rateLimitMap.get(mapKey)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(mapKey, { count: 1, resetAt: now + window })
    return true
  }

  if (entry.count >= max) return false

  entry.count++
  return true
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

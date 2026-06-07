const ALLOWED = new Set([
  'https://app.fixlyy.fr',
  'https://fixlyy.fr',
  'http://localhost:5173',
  'http://localhost:4173',
])

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(origin) ? origin : 'https://app.fixlyy.fr',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }
}

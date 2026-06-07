// Purge automatique RGPD — exécuté chaque dimanche à 3h UTC
// Rétentions appliquées :
//   trial_fingerprints (trial terminé) : 90 jours
//   calls                              : 12 mois
//   sms_conversations                  : 12 mois
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const SB_SERVICE_HEADER = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

const sb = createClient(SB_URL, SB_SERVICE)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SB_SERVICE_HEADER}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const results: Record<string, number> = {}
  const errors: string[] = []

  // ── 1. trial_fingerprints — purge 90 jours après fin d'essai ────────────
  try {
    const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const { count, error } = await sb
      .from('trial_fingerprints')
      .delete({ count: 'exact' })
      .lt('trial_ended_at', cutoff90)
      .not('trial_ended_at', 'is', null)
    if (error) throw error
    results.trial_fingerprints_deleted = count ?? 0
  } catch (e: any) {
    errors.push(`trial_fingerprints: ${e.message}`)
  }

  // ── 2. calls — purge 12 mois ─────────────────────────────────────────────
  try {
    const cutoff12m = new Date(Date.now() - 365 * 86400000).toISOString()
    const { count, error } = await sb
      .from('calls')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff12m)
    if (error) throw error
    results.calls_deleted = count ?? 0
  } catch (e: any) {
    errors.push(`calls: ${e.message}`)
  }

  // ── 3. sms_conversations — purge 12 mois ─────────────────────────────────
  try {
    const cutoff12m = new Date(Date.now() - 365 * 86400000).toISOString()
    const { count, error } = await sb
      .from('sms_conversations')
      .delete({ count: 'exact' })
      .lt('updated_at', cutoff12m)
    if (error) throw error
    results.sms_conversations_deleted = count ?? 0
  } catch (e: any) {
    errors.push(`sms_conversations: ${e.message}`)
  }

  // ── Log dans edge_function_logs ──────────────────────────────────────────
  await sb.from('edge_function_logs').insert({
    function_name: 'rgpd-purge',
    status: errors.length === 0 ? 'success' : 'partial',
    duration_ms: 0,
    input_meta: {},
    output_meta: { ...results, errors },
  }).catch(() => {})

  return new Response(JSON.stringify({ ok: true, ...results, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const ip = getClientIp(req)
  if (!(await checkRateLimit(ip, 'get-slots-remaining', 10, 60_000))) return TOO_MANY_REQUESTS(cors)

  const supabase = createClient(SB_URL, SB_SERVICE)
  const month    = new Date().toISOString().slice(0, 7) // YYYY-MM

  const { data } = await supabase
    .from('monthly_slots')
    .select('slots_displayed')
    .eq('month', month)
    .maybeSingle()

  const remaining = Math.max(1, data?.slots_displayed ?? 10)

  return new Response(JSON.stringify({ remaining }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})

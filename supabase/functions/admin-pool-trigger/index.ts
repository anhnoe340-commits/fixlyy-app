// Proxy admin : déclenche replenish-phone-pool après vérification JWT + ADMIN_USER_ID
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const ADMIN_UID   = Deno.env.get('ADMIN_USER_ID')!

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // Vérifier JWT utilisateur
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const sbUser = createClient(SB_URL, SB_SERVICE)
  const { data: { user }, error } = await sbUser.auth.getUser(token)
  if (error || !user || user.id !== ADMIN_UID) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { dry_run = true } = await req.json().catch(() => ({}))

  // Appel service-to-service avec service_role (jamais exposé au browser)
  const res = await fetch(`${SB_URL}/functions/v1/purchase-phone-numbers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SB_SERVICE}`,
    },
    body: JSON.stringify({ dry_run }),
  })

  const json = await res.json().catch(() => ({}))
  return new Response(JSON.stringify(json), {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts'

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // Rate limit : 3 exports / heure
  const ip = getClientIp(req)
  if (!(await checkRateLimit(ip, 'export-data', 3, 3_600_000))) return TOO_MANY_REQUESTS(CORS)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const [
      { data: profile },
      { data: calls },
      { data: smsConversations },
      { data: appointments },
      { data: contacts },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, email, phone, business_name, created_at, subscription_plan, provisioning_status').eq('id', user.id).single(),
      supabaseAdmin.from('calls').select('id, caller_phone, duration, created_at, reason, summary').eq('artisan_id', user.id).order('created_at', { ascending: false }),
      supabaseAdmin.from('sms_conversations').select('id, client_phone, created_at, updated_at, messages').eq('artisan_id', user.id).order('updated_at', { ascending: false }),
      supabaseAdmin.from('appointments').select('id, client_name, client_phone, appointment_date, notes, created_at').eq('artisan_id', user.id).order('appointment_date', { ascending: false }),
      supabaseAdmin.from('contacts').select('id, name, phone, email, notes, created_at').eq('artisan_id', user.id).order('created_at', { ascending: false }),
    ])

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      profile,
      calls: calls ?? [],
      sms_conversations: smsConversations ?? [],
      appointments: appointments ?? [],
      contacts: contacts ?? [],
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="fixlyy-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err: any) {
    console.error('[export-account-data] error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

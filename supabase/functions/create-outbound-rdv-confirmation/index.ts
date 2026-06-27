import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!

const supabase = createClient(SB_URL, SB_SERVICE)


Deno.serve(async (req) => {

  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SB_SERVICE}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const profileId   = body.profile_id   as string | null
  const callerPhone = body.caller_phone as string | null
  const rdvDate     = body.rdv_date     as string | null
  const rdvTime     = body.rdv_time     as string | null

  if (!profileId || !callerPhone || !rdvDate) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Programmer la confirmation la veille à 17h UTC (≈ 18h/19h Paris)
  const rdvDateObj = new Date(rdvDate)
  rdvDateObj.setDate(rdvDateObj.getDate() - 1)
  rdvDateObj.setHours(17, 0, 0, 0)

  if (rdvDateObj < new Date()) {
    return new Response(JSON.stringify({ ok: true, skipped: 'rdv_in_past' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rdvInfo = rdvTime ? `${rdvDate} à ${rdvTime}` : rdvDate

  const { error } = await supabase.from('outbound_calls').insert({
    profile_id:   profileId,
    caller_phone: callerPhone,
    reason:       'rdv_confirmation',
    scheduled_at: rdvDateObj.toISOString(),
    metadata:     { rdv_info: rdvInfo, rdv_date: rdvDate, rdv_time: rdvTime },
  })

  if (error) {
    console.error('[create-outbound-rdv-confirmation] insert failed:', error.message)
    return new Response(JSON.stringify({ error: 'insert_failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[rdv-confirmation] scheduled for ***${callerPhone.slice(-4)} on ${rdvDateObj.toISOString()}`)

  return new Response(JSON.stringify({ ok: true, scheduled_at: rdvDateObj.toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

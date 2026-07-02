import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'
import { logEvent } from '../_shared/audit.ts'

const inviteBodySchema = z.object({
  email: z.string().email().max(254).trim(),
  role:  z.enum(['admin', 'member']).optional().default('member'),
})

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = 'https://app.fixlyy.fr'

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function planLimit(plan: string): number {
  const p = plan.toLowerCase()
  if (p.includes('max') || p.includes('team') || p.includes('equipe')) return 10
  if (p.includes('pro')) return 3
  return 1
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  const rawBody = await req.json().catch(() => null)
  const parsed = inviteBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Email invalide.'
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  const { email, role } = parsed.data

  const emailNorm = email.toLowerCase()
  if (emailNorm === user.email?.toLowerCase()) {
    return new Response(JSON.stringify({ error: 'Vous ne pouvez pas vous inviter vous-même.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name, subscription_plan')
    .eq('id', user.id)
    .single()

  const limit = planLimit(profile?.subscription_plan ?? 'solo')
  const { count: currentCount } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', user.id)
    .in('status', ['pending', 'active'])

  if ((currentCount ?? 0) >= limit) {
    return new Response(
      JSON.stringify({ error: `Limite de ${limit} membre${limit > 1 ? 's' : ''} atteinte.` }),
      { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const { data: existing } = await supabase
    .from('team_members')
    .select('id, status')
    .eq('owner_user_id', user.id)
    .eq('email', emailNorm)
    .maybeSingle()

  if (existing && existing.status !== 'removed') {
    return new Response(
      JSON.stringify({ error: "Cet email est déjà dans l'équipe." }),
      { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  let memberId: string
  let inviteToken: string

  if (existing?.status === 'removed') {
    const newToken = crypto.randomUUID()
    const newExpiry = new Date(Date.now() + 7 * 86400000).toISOString()
    await supabase.from('team_members').update({
      status: 'pending', role, invitation_token: newToken, invitation_expires_at: newExpiry,
      joined_at: null, member_user_id: null,
    }).eq('id', existing.id)
    memberId = existing.id
    inviteToken = newToken
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('team_members')
      .insert({ owner_user_id: user.id, email: emailNorm, role })
      .select('id, invitation_token')
      .single()
    if (insertError || !inserted) {
      console.error('[invite] insert error:', insertError)
      return new Response(
        JSON.stringify({ error: "Erreur lors de la création de l'invitation." }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    memberId = inserted.id
    inviteToken = inserted.invitation_token
  }

  const companyName = profile?.company_name || 'un artisan'
  const joinUrl = `${APP_URL}/join?token=${inviteToken}`
  const roleLabel = role === 'admin' ? 'Administrateur' : 'Membre'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Fixlyy <noreply@fixlyy.fr>',
      to: [emailNorm],
      subject: `${companyName} vous invite sur Fixlyy`,
      html: `
<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;color:#111827">
  <p style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;margin:0 0 24px">Invitation Fixlyy</p>
  <h1 style="font-size:22px;font-weight:700;margin:0 0 12px">Vous êtes invité(e) sur Fixlyy</h1>
  <p style="font-size:15px;color:#374151;margin:0 0 8px">
    <strong>${companyName}</strong> vous invite à accéder à son dashboard Fixlyy en tant que <strong>${roleLabel}</strong>.
  </p>
  <p style="font-size:14px;color:#6B7280;margin:0 0 28px">
    Vous pourrez suivre les appels, gérer les clients et consulter les rendez-vous en temps réel.
  </p>
  <a href="${joinUrl}"
     style="display:inline-block;background:#2850c8;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
    Accepter l'invitation
  </a>
  <p style="font-size:12px;color:#9CA3AF;margin:24px 0 0">
    Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.
  </p>
  <p style="font-size:12px;color:#D1D5DB;margin:8px 0 0">— Mia · Fixlyy</p>
</div>`,
    }),
  }).catch(e => console.error('[invite] resend error:', e.message))

  await logEvent({
    supabase, eventType: 'team_member_invited', userId: user.id,
    resourceType: 'team_member', resourceId: memberId,
    metadata: { invitee_email: emailNorm, role }, severity: 'info',
  })

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
})

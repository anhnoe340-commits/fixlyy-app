import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logEvent } from '../_shared/audit.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!)

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.fixlyy.fr',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── GET ?token=xxx — valider le token (endpoint public) ─────────────────────
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token manquant.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: invite } = await supabase
      .from('team_members')
      .select('id, owner_user_id, email, status, invitation_expires_at')
      .eq('invitation_token', token)
      .maybeSingle()

    if (!invite) return new Response(JSON.stringify({ error: 'Invitation introuvable.' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (invite.status === 'active') return new Response(JSON.stringify({ error: 'Cette invitation est déjà acceptée.' }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (invite.status === 'removed') return new Response(JSON.stringify({ error: 'Cette invitation a été annulée.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (new Date(invite.invitation_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Cette invitation a expiré. Demandez à votre administrateur de vous en envoyer une nouvelle.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('company_name')
      .eq('id', invite.owner_user_id)
      .single()

    return new Response(JSON.stringify({
      ok: true,
      email: invite.email,
      company: ownerProfile?.company_name || 'votre entreprise',
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // ── POST { token } + JWT Bearer — lier le compte au team_member ─────────────
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    let body: { token: string }
    try { body = await req.json() } catch {
      return new Response('Invalid JSON', { status: 400, headers: CORS })
    }
    const { token } = body
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token requis.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: invite } = await supabase
      .from('team_members')
      .select('id, owner_user_id, email, status, invitation_expires_at, role')
      .eq('invitation_token', token)
      .maybeSingle()

    if (!invite) return new Response(JSON.stringify({ error: 'Invitation introuvable.' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (invite.status === 'active') return new Response(JSON.stringify({ error: 'Invitation déjà acceptée.' }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (invite.status === 'removed') return new Response(JSON.stringify({ error: 'Invitation annulée.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (new Date(invite.invitation_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invitation expirée.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { error: updateError } = await supabase.from('team_members').update({
      member_user_id: user.id,
      status: 'active',
      joined_at: new Date().toISOString(),
    }).eq('id', invite.id)

    if (updateError) {
      console.error('[accept] update error:', updateError)
      return new Response(JSON.stringify({ error: "Erreur lors de l'activation." }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    await supabase.from('team_activity_log').insert({
      owner_user_id: invite.owner_user_id,
      member_user_id: user.id,
      member_email: invite.email,
      action: 'viewed_dashboard',
    }).catch(e => console.error('[accept] log error:', e.message))

    await logEvent({
      supabase, eventType: 'team_member_joined', userId: invite.owner_user_id,
      resourceType: 'team_member', resourceId: invite.id,
      metadata: { member_id: user.id, member_email: invite.email, role: invite.role }, severity: 'info',
    })

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405, headers: CORS })
})

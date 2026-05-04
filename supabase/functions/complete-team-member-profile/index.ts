import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// POST /complete-team-member-profile
// Body: { token, last_name, email?, hours_json? }
// Public endpoint — le token EST l'authentification
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let body: { token: string; last_name: string; email?: string; hours_json?: Record<string, unknown> }
  try { body = await req.json() } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { token, last_name, email, hours_json } = body
  if (!token || !last_name?.trim()) {
    return new Response(JSON.stringify({ error: 'Token et nom de famille requis.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Valider le token
  const { data: invitation } = await supabase
    .from('team_invitations')
    .select('id, owner_id, first_name, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invitation) {
    return new Response(JSON.stringify({ error: 'Invitation introuvable.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (invitation.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Cette invitation n\'est plus valide.' }), {
      status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id)
    return new Response(JSON.stringify({ error: 'Cette invitation a expiré.' }), {
      status: 410, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Activer le membre
  const { error: updateError } = await supabase
    .from('team_invitations')
    .update({
      last_name: last_name.trim(),
      email: email?.trim() || null,
      hours_json: hours_json || null,
      is_active: true,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  if (updateError) {
    console.error('Update error:', updateError)
    return new Response(JSON.stringify({ error: 'Erreur lors de l\'activation du profil.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    member: {
      name: `${invitation.first_name} ${last_name.trim()}`,
    },
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

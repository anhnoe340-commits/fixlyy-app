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

// GET /accept-team-invitation?token=xxxx
// Public endpoint — le token EST l'authentification
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Token manquant.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Récupérer l'invitation
  const { data: invitation } = await supabase
    .from('team_invitations')
    .select('id, owner_id, first_name, phone, suggested_skills, status, expires_at, is_active')
    .eq('token', token)
    .maybeSingle()

  if (!invitation) {
    return new Response(JSON.stringify({ error: 'Invitation introuvable.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (invitation.status === 'revoked') {
    return new Response(JSON.stringify({ error: 'Cette invitation a été annulée. Demandez à votre patron de vous renvoyer une invitation.' }), {
      status: 410, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (invitation.status === 'accepted' || invitation.is_active) {
    return new Response(JSON.stringify({ error: 'Ce profil est déjà activé.' }), {
      status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id)
    return new Response(JSON.stringify({ error: 'Cette invitation a expiré. Demandez à votre patron de vous renvoyer une invitation.' }), {
      status: 410, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Récupérer les infos de l'entreprise (patron)
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('company_name, company_type')
    .eq('id', invitation.owner_id)
    .single()

  return new Response(JSON.stringify({
    ok: true,
    invitation: {
      id: invitation.id,
      first_name: invitation.first_name,
      phone: invitation.phone,
      suggested_skills: invitation.suggested_skills,
    },
    company: {
      name: ownerProfile?.company_name || 'votre entreprise',
      type: ownerProfile?.company_type || '',
    },
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})

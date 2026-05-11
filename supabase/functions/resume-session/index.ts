// Valide un resume_token et retourne les infos user pour reprise d'onboarding
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!
const SB_ANON    = Deno.env.get('SUPABASE_ANON_KEY')!

const sb = createClient(SB_URL, SB_SERVICE)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return new Response(JSON.stringify({ error: 'missing_token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, phone, onboarding_step, full_name')
    .eq('resume_token', token)
    .maybeSingle()

  if (error || !profile) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!profile.phone) {
    return new Response(JSON.stringify({ error: 'no_phone' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Déclenche un OTP phone via le client anon (même behaviour que le frontend)
  const sbAnon = createClient(SB_URL, SB_ANON)
  const { error: otpErr } = await sbAnon.auth.signInWithOtp({ phone: profile.phone })
  if (otpErr) {
    return new Response(JSON.stringify({ error: 'otp_failed', detail: otpErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    phone: profile.phone,
    onboarding_step: profile.onboarding_step ?? 1,
    first_name: (profile.full_name || '').split(' ')[0] || '',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

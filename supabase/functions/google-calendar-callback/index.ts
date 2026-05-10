import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const APP_URL = Deno.env.get('APP_URL') || 'https://app.fixlyy.fr'
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-callback`

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // artisan user_id
  const error = url.searchParams.get('error')

  if (error || !code || !state) {
    return Response.redirect(`${APP_URL}?gcal=error`, 302)
  }

  try {
    // Échanger le code contre les tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text())
      return Response.redirect(`${APP_URL}?gcal=error`, 302)
    }

    const tokens = await tokenRes.json()
    const expiryMs = Date.now() + (tokens.expires_in || 3600) * 1000

    // Stocker les tokens dans profiles
    const { error: dbError } = await supabase
      .from('profiles')
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token || null,
        google_token_expiry: expiryMs,
      })
      .eq('id', state)

    if (dbError) {
      console.error('DB update failed:', dbError)
      return Response.redirect(`${APP_URL}?gcal=error`, 302)
    }

    return Response.redirect(`${APP_URL}?gcal=success`, 302)
  } catch (e: any) {
    console.error('Google OAuth error:', e.message)
    return Response.redirect(`${APP_URL}?gcal=error`, 302)
  }
})

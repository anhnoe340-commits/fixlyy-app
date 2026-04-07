import { createClient } from '@supabase/supabase-js'

// Replace with your actual Supabase project URL and anon key
// from https://app.supabase.com → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type SupabaseUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']

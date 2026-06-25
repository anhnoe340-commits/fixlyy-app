import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, 'capture-demo-lead', 5, 60_000)) {
    return TOO_MANY_REQUESTS(cors);
  }

  try {
    const { email, phone } = await req.json();

    if (!email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: 'email_invalide' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Sanitiser le téléphone : garder uniquement chiffres, +, espaces et tirets
    const cleanPhone = phone ? String(phone).replace(/[^\d\s+\-().]/g, '').trim().slice(0, 20) : null;

    await supabase.from('demo_leads').insert({ email: email.trim().toLowerCase().slice(0, 254), phone: cleanPhone });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Une erreur est survenue' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

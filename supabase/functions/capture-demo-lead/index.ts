import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!,
);

const schema = z.object({
  email: z.string().email().max(254),
  phone: z.string().max(20).optional(),
});

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ip = getClientIp(req);
  if (!(await checkRateLimit(ip, 'capture-demo-lead', 5, 60_000))) {
    return TOO_MANY_REQUESTS(cors);
  }

  try {
    const body = await req.json().catch(() => null);
    const result = schema.safeParse(body);
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'email_invalide' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { email, phone } = result.data;
    const cleanPhone = phone ? phone.replace(/[^\d\s+\-().]/g, '').trim() : null;

    // Upsert sur phone (comme demo-call/index.ts) pour éviter l'erreur de
    // contrainte unique quand un même numéro resoumet le formulaire.
    const { error } = await supabase.from('demo_leads').upsert(
      { email: email.trim().toLowerCase(), phone: cleanPhone },
      { onConflict: 'phone', ignoreDuplicates: false },
    );

    if (error) {
      console.error('[capture-demo-lead] upsert error:', error.message);
      return new Response(JSON.stringify({ error: 'Une erreur est survenue' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

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

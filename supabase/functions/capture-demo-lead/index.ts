import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { checkRateLimit, getClientIp, TOO_MANY_REQUESTS } from '../_shared/rateLimit.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!,
);

// z.preprocess normalise un champ absent/null en chaîne vide, pour que le
// message custom min(1, ...) se déclenche aussi bien sur "clé absente" que
// sur "chaîne vide" (sinon un champ absent échoue sur le type-check générique
// de zod avant même d'atteindre .min(), avec un message par défaut inexploitable).
const schema = z.object({
  phone: z.preprocess(v => v ?? '', z.string().trim().min(1, 'telephone_requis').max(20)),
  email: z.preprocess(v => v ?? '', z.string().trim().min(1, 'email_requis').max(254).email('email_invalide')),
});

const ERROR_MESSAGES: Record<string, string> = {
  email_requis:     "L'email est requis",
  email_invalide:   "L'email est invalide",
  telephone_requis: 'Le numéro de téléphone est requis',
};

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
      const code = result.error.issues[0]?.message ?? 'requete_invalide';
      const message = ERROR_MESSAGES[code] ?? 'Requête invalide';
      return new Response(JSON.stringify({ error: message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { email, phone } = result.data;
    const cleanPhone = phone.replace(/[^\d\s+\-().]/g, '').trim();

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

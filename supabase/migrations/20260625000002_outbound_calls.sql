-- ── outbound_calls table ──────────────────────────────────────────────────
CREATE TABLE public.outbound_calls (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  caller_phone     TEXT        NOT NULL,
  reason           TEXT        NOT NULL CHECK (reason IN ('missed_callback','rdv_confirmation','devis_followup','client_relance')),
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','initiated','completed','failed','cancelled')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  initiated_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  duration_seconds INTEGER,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artisan voit ses appels sortants"
  ON public.outbound_calls FOR SELECT
  USING (profile_id = auth.uid());

CREATE INDEX idx_outbound_calls_profile   ON public.outbound_calls(profile_id);
CREATE INDEX idx_outbound_calls_scheduled ON public.outbound_calls(status, scheduled_at);
CREATE INDEX idx_outbound_calls_month     ON public.outbound_calls(profile_id, created_at);

-- ── outbound_calls_count sur profiles (TÂCHE 5) ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS outbound_calls_count INTEGER NOT NULL DEFAULT 0;

-- ── Cron : reset mensuel du compteur ─────────────────────────────────────
SELECT cron.unschedule('reset-outbound-count')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-outbound-count');

SELECT cron.schedule(
  'reset-outbound-count',
  '0 0 1 * *',
  $$UPDATE public.profiles SET outbound_calls_count = 0$$
);

-- ── Cron : relance clients inactifs > 30 jours (hebdo lundi 9h UTC) ──────
SELECT cron.unschedule('weekly-client-relance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-client-relance');

SELECT cron.schedule(
  'weekly-client-relance',
  '0 9 * * 1',
  $$
  INSERT INTO public.outbound_calls (profile_id, caller_phone, reason, scheduled_at)
  SELECT DISTINCT ON (c.artisan_id, c.caller_phone)
    c.artisan_id,
    c.caller_phone,
    'client_relance',
    NOW() + interval '30 minutes'
  FROM public.calls c
  WHERE c.caller_phone IS NOT NULL
    AND c.caller_phone NOT IN ('Inconnu', '')
    AND c.created_at BETWEEN NOW() - interval '90 days' AND NOW() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.calls c2
      WHERE c2.artisan_id = c.artisan_id
        AND c2.caller_phone = c.caller_phone
        AND c2.created_at > NOW() - interval '30 days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.outbound_calls oc
      WHERE oc.profile_id = c.artisan_id
        AND oc.caller_phone = c.caller_phone
        AND oc.reason = 'client_relance'
        AND oc.created_at > NOW() - interval '7 days'
    );
  $$
);

-- ── Cron : outbound-scheduler toutes les 5 minutes ───────────────────────
SELECT cron.unschedule('outbound-scheduler')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outbound-scheduler');

SELECT cron.schedule(
  'outbound-scheduler',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/outbound-scheduler',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

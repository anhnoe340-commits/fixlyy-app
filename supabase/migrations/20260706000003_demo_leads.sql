-- Migration : demo_leads — ajout des colonnes de capture post-appel
-- Date      : 2026-07-06

ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS room_name TEXT;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS call_transcript TEXT;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS needs_summary TEXT;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS metier_evoque TEXT;

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

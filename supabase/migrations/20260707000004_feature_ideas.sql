-- Table des idees de fonctionnalites extraites des appels demo
-- Systeme de points : plus d'artisans mentionnent la meme idee, plus de points

CREATE TABLE IF NOT EXISTS public.feature_ideas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_text           TEXT NOT NULL,
  category            TEXT,
  points              INTEGER NOT NULL DEFAULT 1,
  mention_count       INTEGER NOT NULL DEFAULT 1,
  source_rooms        TEXT[]  NOT NULL DEFAULT '{}',
  first_mentioned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_ideas_idea_text_unique ON public.feature_ideas (idea_text);

ALTER TABLE public.feature_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.feature_ideas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_read" ON public.feature_ideas
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert" ON public.feature_ideas
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.feature_ideas
  FOR SELECT TO authenticated USING (true);

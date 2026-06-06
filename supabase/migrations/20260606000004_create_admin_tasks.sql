-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : create_admin_tasks
-- Date      : 2026-06-06
-- Objectif  : Tableau de tâches admin interne (kanban)
--             Accessible uniquement à l'admin Fixlyy (user Noé)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_tasks (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text    NOT NULL,
  description text,
  priority    text    NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status      text    NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo', 'in_progress', 'done')),
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour tri par priorité puis création
CREATE INDEX idx_admin_tasks_status   ON public.admin_tasks (status, created_at DESC);
CREATE INDEX idx_admin_tasks_priority ON public.admin_tasks (priority, due_date ASC NULLS LAST);

-- RLS : lecture et écriture réservées à l'admin uniquement
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_tasks"
  ON public.admin_tasks
  FOR ALL
  USING (auth.uid() = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'::uuid)
  WITH CHECK (auth.uid() = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'::uuid);

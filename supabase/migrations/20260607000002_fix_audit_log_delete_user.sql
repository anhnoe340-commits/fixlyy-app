-- Fix : audit_log_immutable bloquait la suppression des utilisateurs
--
-- Problème : audit_log.user_id a ON DELETE SET NULL vers auth.users.
-- Quand un user est supprimé, Postgres fait UPDATE audit_log SET user_id = NULL.
-- Le trigger trg_audit_log_no_update interceptait cet UPDATE et levait une exception
-- → GoTrue retournait "Database error deleting user".
--
-- Solution : le trigger autorise désormais le SET NULL (user_id → NULL) déclenché
-- par la suppression d'un utilisateur, tout en continuant à bloquer les autres
-- mises à jour manuelles.

CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Autoriser le SET NULL déclenché par ON DELETE SET NULL (anonymisation RGPD)
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT NULL
     AND NEW.user_id IS NULL
     AND OLD.id = NEW.id
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log est append-only : les mises à jour et suppressions sont interdites';
END;
$$;

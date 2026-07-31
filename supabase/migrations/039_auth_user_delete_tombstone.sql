-- 039 — la lápida se produce por trigger, sea cual sea la vía de borrado.
--
-- Intención: el invariante es "un perfil sin usuario de auth queda como
-- LÁPIDA, nunca activo". Hasta ahora sólo lo garantizaba la Edge Function
-- `delete-account`; borrar desde el panel de Supabase, por SQL o por la Admin
-- API dejaba un perfil ACTIVO sin credenciales — visible y contactable, con
-- PII intacta, imposible de reclamar por su dueño.
--
-- Reparto de responsabilidades (no duplicar la regla en dos sitios):
--   · Este trigger   = ÚNICO dueño de la anonimización EN BASE DE DATOS.
--   · delete-account = autenticar al llamante, guard de último admin, borrado
--     de ficheros en Storage, y auth.admin.deleteUser(). Sus pasos de BD se
--     eliminan en el mismo cambio.
--
-- AFTER DELETE, no BEFORE. La atomicidad es idéntica (misma transacción: si
-- esto falla, el borrado se deshace y no queda fantasma), pero AFTER da algo
-- que BEFORE no: cuando corre, la fila de `auth.users` YA NO EXISTE. Eso
-- convierte "hay un borrado de cuenta en curso" en un HECHO VERIFICABLE por
-- quien lo necesite, en vez de una bandera transaccional que alguien tenga que
-- acordarse de poner. Comprobado empíricamente antes de escribir esto, no
-- deducido de la documentación (prueba en transacción con rollback:
-- `auth_row_presente_en_trigger = false`).
--
-- Deliberadamente FUERA de este trigger:
--   · El guard de "último admin": es una regla de negocio del producto, no un
--     invariante de integridad. Un borrado por el panel se la salta por
--     definición; lo que NO puede hacer es dejar un fantasma.
--   · Los ficheros de Storage: SQL no puede llamar a la Storage API. Un
--     borrado que no pase por `delete-account` deja objetos huérfanos en el
--     bucket. Aceptado y documentado; detectarlos queda como tarea aparte.
--
-- Idempotente a propósito: `delete-account` puede haber anonimizado ya. Todas
-- las escrituras son convergentes (escriben el valor canónico) y ninguna
-- revierte una anonimización previa.

CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role          app_role;
  v_technician_id UUID;
  v_deleted_email TEXT := 'deleted_' || OLD.id || '@deleted.invalid';
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = OLD.id;

  -- Sin fila en profiles no hay lápida que construir (p. ej. un alta abortada
  -- antes de que corriera handle_new_user). No es un error.
  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mensajes de chat: se conserva la conversación, se anonimiza el contenido.
  UPDATE chat_messages
     SET body = '[Message deleted]'
   WHERE sender_user_id = OLD.id
     AND body <> '[Message deleted]';

  IF v_role = 'technician' THEN
    SELECT id INTO v_technician_id FROM technician_profiles WHERE user_id = OLD.id;

    IF v_technician_id IS NOT NULL THEN
      -- Registros de documentos. Los FICHEROS los borra delete-account; por
      -- cualquier otra vía quedan huérfanos en el bucket (ver cabecera).
      DELETE FROM documents WHERE technician_id = v_technician_id;

      UPDATE offer_applications
         SET cover_note = NULL
       WHERE technician_id = v_technician_id
         AND cover_note IS NOT NULL;

      -- PII del perfil. Se conservan cualificaciones e historial: la lápida
      -- existe para que la empresa no pierda el rastro de con quién trabajó.
      UPDATE technician_profiles
         SET first_name   = '[Deleted]',
             last_name    = '[User]',
             email        = v_deleted_email,
             phone        = NULL,
             social_links = NULL,
             birth_date   = '1900-01-01'
       WHERE id = v_technician_id;
    END IF;

  ELSIF v_role = 'company_user' THEN
    -- La empresa y su historial NO se tocan: sólo cae la pertenencia.
    -- guard_company_last_admin lo deja pasar porque el usuario de auth ya no
    -- existe (ver abajo) — no es gestión de empresa, es una consecuencia.
    DELETE FROM company_members WHERE user_id = OLD.id;
  END IF;

  UPDATE profiles
     SET email  = v_deleted_email,
         status = 'deleted'
   WHERE id = OLD.id;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();

-- El guard de último admin sigue rigiendo las acciones de GESTIÓN (quitar o
-- degradar a un admin desde la app). Lo que deja de bloquear es la retirada de
-- la membresía cuando el usuario de auth YA NO EXISTE: eso no es una decisión
-- sobre la empresa, es la consecuencia de que la cuenta dejó de existir.
--
-- La condición es un hecho comprobable en el momento de evaluarla, no una
-- bandera de sesión: si `auth.users` no tiene esa fila, no hay a quién
-- proteger de perder su acceso.
CREATE OR REPLACE FUNCTION public.guard_company_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_count INT;
BEGIN
  IF is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      SELECT COUNT(*) INTO v_admin_count
      FROM company_members
      WHERE company_id = OLD.company_id
        AND role = 'admin'
        AND id <> OLD.id;
      IF v_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last admin of a company';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = OLD.company_id
      AND role = 'admin'
      AND id <> OLD.id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot downgrade the last admin of a company';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Salud de los ganchos sobre auth.users, legible desde fuera.
--
-- Los dos triggers viven en un esquema que NO controlamos: un upgrade de
-- Supabase Auth que recreara `auth.users` se los llevaría por delante y nada
-- lo notaría — el alta dejaría de crear `profiles` y el borrado dejaría de
-- construir la lápida, ambos EN SILENCIO. PostgREST no puede consultar
-- pg_catalog, así que la comprobación necesita esta ventana explícita.
-- Sólo devuelve nombres y un booleano: ningún dato de usuario.
CREATE OR REPLACE FUNCTION public.auth_hooks_health()
RETURNS TABLE (trigger_name text, present boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.name,
         EXISTS (
           SELECT 1 FROM pg_trigger tg
           JOIN pg_class c ON c.oid = tg.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE NOT tg.tgisinternal
             AND n.nspname = 'auth' AND c.relname = 'users'
             AND tg.tgname = t.name
         )
  FROM (VALUES ('on_auth_user_created'), ('on_auth_user_deleted')) AS t(name);
$function$;

GRANT EXECUTE ON FUNCTION public.auth_hooks_health() TO anon, authenticated;

-- Etiqueta corregida (clase 4 de la taxonomía de la auditoría): la migración
-- 015 describe user_consents como "immutable audit trail", y no lo es — la FK
-- `user_consents_user_id_fkey` es ON DELETE CASCADE, así que borrar la cuenta
-- destruye el consentimiento. No se edita una migración aplicada, así que la
-- corrección vive aquí y en docs/MISSION_PART66.md. Qué hacer al respecto se
-- decide con la política de retención RGPD, no aquí.
COMMENT ON TABLE public.user_consents IS
  'Registro de consentimientos (ToS/privacidad). NO es un audit trail inmutable, '
  'pese a lo que dice la cabecera de la migración 015: no admite UPDATE, pero la '
  'FK a auth.users es ON DELETE CASCADE y el borrado de la cuenta ELIMINA la fila. '
  'Pendiente de decisión junto a la política de retención (ofertas archivadas y '
  'perfiles eliminados).';

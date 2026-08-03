-- 042 — `profiles.deleted_at`: cuándo se convirtió la cuenta en lápida.
--
-- Intención: hasta ahora el borrado sólo dejaba `status = 'deleted'`. Eso dice
-- QUE la cuenta se borró, nunca CUÁNDO. `profiles` no tiene `updated_at`, así
-- que no había ni siquiera un proxy: la fecha de baja era irrecuperable.
--
-- Por qué importa y no es un adorno: la señal de producto de una baja está en
-- el intervalo `created_at → deleted_at`, no en el hecho aislado. Una cuenta
-- que dura cinco minutos y otra que dura ocho meses son dos problemas
-- distintos, y sin esta columna el panel no puede distinguirlos. También es lo
-- que permite comprobar el compromiso de la política de privacidad ("erased or
-- anonymised within 30 days"): sin fecha de baja, ese plazo no es auditable.
--
-- NO se rellenan las filas ya existentes. La fecha real no está en ninguna
-- parte y `technician_profiles.updated_at` sólo la aproxima mientras nadie
-- vuelva a escribir esa fila — inventar un dato de auditoría plausible es peor
-- que admitir que no se registró. Quedan en NULL y la UI lo dice.
--
-- Columna en `profiles` y no en `technician_profiles`: la lápida es de la
-- CUENTA. Un company_user borrado no tiene fila de técnico, y aun así su baja
-- tiene fecha.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Momento en que la cuenta pasó a lápida (status=''deleted''), escrito por '
  'handle_deleted_user(). NULL en cuentas vivas y también en las lápidas '
  'anteriores a la migración 042, cuya fecha real no se registró: NULL ahí '
  'significa "no consta", no "borrada hoy".';

-- Sólo se añade la escritura de deleted_at; el resto del cuerpo es idéntico al
-- de la migración 039, que sigue siendo el dueño único de la anonimización.
--
-- `COALESCE(deleted_at, now())` en vez de `now()` a secas para que siga siendo
-- convergente: si la función se reejecutara sobre una lápida ya construida
-- (039 la declara idempotente a propósito), la fecha de baja original NO se
-- reescribe con la del reintento.
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
      -- cualquier otra vía quedan huérfanos en el bucket (ver 039).
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
    DELETE FROM company_members WHERE user_id = OLD.id;
  END IF;

  UPDATE profiles
     SET email      = v_deleted_email,
         status     = 'deleted',
         deleted_at = COALESCE(deleted_at, now())
   WHERE id = OLD.id;

  RETURN NULL;
END;
$function$;

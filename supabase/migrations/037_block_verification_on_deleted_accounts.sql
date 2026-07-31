-- 037 — admin_update_technician_verification rechaza cuentas borradas.
--
-- Intención: una cuenta borrada es una LÁPIDA (PII anonimizada,
-- profiles.status='deleted', sin usuario de auth, historial conservado a
-- propósito). Debe poder consultarse, nunca moderarse.
--
-- Razonamiento: la función escribía profiles.status a partir únicamente del
-- verification_status pedido, sin mirar el estado actual. Sobre una lápida,
-- 'verified' la dejaba en 'active' y 'pending' en 'pending_verification'; y
-- technician_public_view (024) admite AMBOS, así que el técnico borrado
-- reaparecía en búsqueda, mapa y ranking de candidatos. El guard va aquí, en
-- la función SECURITY DEFINER, y no sólo en la UI: es el único punto por el
-- que pasa cualquier vía de cambio de verificación.
--
-- Se conserva el resto del cuerpo sin cambios, incluido el mapeo
-- verified→active / pending→pending_verification / rejected→suspended.

CREATE OR REPLACE FUNCTION public.admin_update_technician_verification(
  p_technician_id uuid,
  p_status        verification_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        UUID;
  v_profile_status user_status;
  v_current_status user_status;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can update technician verification';
  END IF;

  -- Estado de cuenta ACTUAL, antes de decidir nada.
  SELECT p.status
    INTO v_current_status
    FROM technician_profiles tp
    JOIN profiles p ON p.id = tp.user_id
   WHERE tp.id = p_technician_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Technician % not found', p_technician_id;
  END IF;

  IF v_current_status = 'deleted' THEN
    RAISE EXCEPTION
      'Technician % belongs to a deleted account and cannot be moderated', p_technician_id;
  END IF;

  CASE p_status
    WHEN 'verified' THEN v_profile_status := 'active';
    WHEN 'pending'  THEN v_profile_status := 'pending_verification';
    WHEN 'rejected' THEN v_profile_status := 'suspended';
  END CASE;

  UPDATE technician_profiles
  SET verification_status = p_status
  WHERE id = p_technician_id
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Technician % not found', p_technician_id;
  END IF;

  UPDATE profiles
  SET status = v_profile_status
  WHERE id = v_user_id;
END;
$function$;

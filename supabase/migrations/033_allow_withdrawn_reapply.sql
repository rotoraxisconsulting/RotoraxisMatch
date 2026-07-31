-- ============================================================
-- 033 — Permitir withdrawn → pending, SOLO en offer_applications
--
-- Fecha: 2026-07-28. Rationale: docs/MISSION_PART66.md.
--
-- Retirarse (el técnico se echa atrás) y ser rechazado (la empresa dice no)
-- son cosas semánticamente distintas. Que la primera vetara al técnico de
-- por vida de esa oferta era un EFECTO COLATERAL de la regla H6 (una
-- aplicación por oferta), no una decisión de producto.
--
-- `rejected` sigue siendo terminal: asimetría deliberada.
--
-- ── POR QUÉ LA FUNCIÓN PASA A CONOCER LA TABLA ─────────────
-- `assert_offer_relation_transition(old, new)` era GENÉRICA y la usan los
-- triggers de LAS DOS tablas (offer_requests y offer_applications, vía
-- handle_offer_relation_status_transition, que ya se ramifica por
-- TG_TABLE_NAME). Relajarla sin más habilitaba withdrawn → pending también
-- para las ofertas directas, que NO es lo que queremos:
--
--   - offer_applications: UNIQUE(technician_id, offer_id) TOTAL. Insertar
--     una segunda fila es imposible ⇒ reactivar es la ÚNICA forma de volver
--     a aplicar. La reactivación es NECESARIA aquí.
--   - offer_requests: único PARCIAL (uq_offer_requests_one_active, solo
--     sobre estados activos). Tras retirar, la empresa crea una fila NUEVA
--     — camino que ya existe y ya funciona. Reactivar sería maquinaria
--     inalcanzable, y además peligrosa: reactivar una retirada mientras hay
--     otra activa para el mismo par chocaría con ese índice parcial y
--     saldría un error crudo de Postgres.
--
-- Por eso la función recibe ahora el tipo de relación y el trigger le pasa
-- TG_TABLE_NAME. Espejo EXACTO de ALLOWED_TRANSITIONS en
-- `src/utils/offerRelationStateMachine.ts` (que es especificación y tests;
-- el enforcer real es esta función). Si cambias una, cambia la otra.
--
-- ── Lo que NO cambia (verificado, no asumido) ──────────────
-- `handle_offer_relation_status_transition()` ya pone identity_revealed y
-- documents_unlocked a **false** en toda transición cuyo destino no sea
-- 'accepted'. Reactivar a 'pending' los resetea solo: no puede filtrar
-- identidad. Confirmado contra los datos (solo las filas accepted los
-- llevan a true).
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. La función, ahora con el tipo de relación ──────────────────────
-- Firma nueva de 3 argumentos. La de 2 se elimina en el paso C: dejarla
-- viva sería un segundo camino con la regla antigua — exactamente la
-- divergencia que esta migración cierra.

CREATE OR REPLACE FUNCTION public.assert_offer_relation_transition(
  old_status offer_request_status,
  new_status offer_request_status,
  relation_table text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF old_status = new_status THEN RETURN; END IF;

  -- pending: puede ir a cualquier desenlace, en ambas tablas.
  IF old_status = 'pending' THEN
    IF new_status NOT IN ('accepted', 'rejected', 'expired', 'withdrawn') THEN
      RAISE EXCEPTION 'Invalid status transition: % → %', old_status, new_status;
    END IF;
    RETURN;
  END IF;

  -- withdrawn: reversible SOLO en aplicaciones, y solo de vuelta a pending
  -- (nunca un atajo a accepted: reactivar devuelve la relación al flujo
  -- normal, no lo salta).
  IF old_status = 'withdrawn' AND relation_table = 'offer_applications' THEN
    IF new_status <> 'pending' THEN
      RAISE EXCEPTION 'A withdrawn application can only be reactivated to pending, not to %', new_status;
    END IF;
    RETURN;
  END IF;

  IF old_status = 'withdrawn' THEN
    RAISE EXCEPTION 'A withdrawn direct offer is not reactivated — send a new one instead (% → %)', old_status, new_status;
  END IF;

  -- accepted / rejected / expired: terminales de verdad, en ambas tablas.
  RAISE EXCEPTION 'Terminal status cannot transition: % → %', old_status, new_status;
END;
$function$;


-- ── B. El trigger le pasa la tabla ────────────────────────────────────
-- Único cambio respecto a la versión previa: el PERFORM lleva TG_TABLE_NAME.
-- El resto del cuerpo se reproduce igual (reseteo de identity/documents,
-- creación de sala de chat al aceptar).

CREATE OR REPLACE FUNCTION public.handle_offer_relation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = NEW.status THEN
    NEW.identity_revealed  := OLD.identity_revealed;
    NEW.documents_unlocked := OLD.documents_unlocked;
    RETURN NEW;
  END IF;

  PERFORM assert_offer_relation_transition(OLD.status, NEW.status, TG_TABLE_NAME);

  IF NEW.status = 'accepted' THEN
    NEW.identity_revealed  := true;
    NEW.documents_unlocked := true;

    IF TG_TABLE_NAME = 'offer_requests' THEN
      INSERT INTO chat_rooms (offer_request_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO chat_rooms (offer_application_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    END IF;

  ELSE
    NEW.identity_revealed  := false;
    NEW.documents_unlocked := false;
  END IF;

  RETURN NEW;
END;
$function$;


-- ── C. Retirar la firma antigua de 2 argumentos ───────────────────────
-- CREATE OR REPLACE con distinta aridad crea una SOBRECARGA, no sustituye.
-- Dejarla viva mantendría la regla vieja accesible por otro camino.

DROP FUNCTION IF EXISTS public.assert_offer_relation_transition(offer_request_status, offer_request_status);


-- ── D. Comprobación de post-condiciones ───────────────────────────────
-- Ejercita la función REAL con cada caso, en vez de confiar en el texto de
-- su definición.

DO $$
DECLARE
  n_overloads INTEGER;

  -- Espera que la llamada falle; revienta si NO falla.
  PROCEDURE_MARKER TEXT := '033 ABORTADA';
BEGIN
  -- Debe permitir
  PERFORM assert_offer_relation_transition('withdrawn'::offer_request_status, 'pending'::offer_request_status, 'offer_applications');
  PERFORM assert_offer_relation_transition('pending'::offer_request_status,   'accepted'::offer_request_status,  'offer_applications');
  PERFORM assert_offer_relation_transition('pending'::offer_request_status,   'withdrawn'::offer_request_status, 'offer_requests');

  -- Debe bloquear: reactivar una OFERTA DIRECTA retirada
  BEGIN
    PERFORM assert_offer_relation_transition('withdrawn'::offer_request_status, 'pending'::offer_request_status, 'offer_requests');
    RAISE EXCEPTION '% : withdrawn->pending NO debe permitirse en offer_requests.', PROCEDURE_MARKER;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE PROCEDURE_MARKER || '%' THEN RAISE; END IF;
  END;

  -- Debe bloquear: rejected sigue terminal (asimetría deliberada)
  BEGIN
    PERFORM assert_offer_relation_transition('rejected'::offer_request_status, 'pending'::offer_request_status, 'offer_applications');
    RAISE EXCEPTION '% : rejected->pending deberia seguir bloqueado.', PROCEDURE_MARKER;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE PROCEDURE_MARKER || '%' THEN RAISE; END IF;
  END;

  -- Debe bloquear: accepted sigue terminal
  BEGIN
    PERFORM assert_offer_relation_transition('accepted'::offer_request_status, 'pending'::offer_request_status, 'offer_applications');
    RAISE EXCEPTION '% : accepted->pending deberia seguir bloqueado.', PROCEDURE_MARKER;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE PROCEDURE_MARKER || '%' THEN RAISE; END IF;
  END;

  -- Debe bloquear: atajo withdrawn -> accepted
  BEGIN
    PERFORM assert_offer_relation_transition('withdrawn'::offer_request_status, 'accepted'::offer_request_status, 'offer_applications');
    RAISE EXCEPTION '% : withdrawn->accepted deberia estar bloqueado.', PROCEDURE_MARKER;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE PROCEDURE_MARKER || '%' THEN RAISE; END IF;
  END;

  -- La firma antigua no debe seguir viva
  SELECT count(*) INTO n_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'assert_offer_relation_transition';
  IF n_overloads <> 1 THEN
    RAISE EXCEPTION '% : hay % versiones de assert_offer_relation_transition, deberia haber 1.', PROCEDURE_MARKER, n_overloads;
  END IF;

  RAISE NOTICE '033 OK — reactivacion solo en aplicaciones; ofertas directas y estados terminales intactos; una sola firma.';
END $$;

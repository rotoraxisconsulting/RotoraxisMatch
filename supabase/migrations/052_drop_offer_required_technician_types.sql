-- ============================================================
-- AviationJobTalent V2 — Migration 052: DROP offer_required_technician_types
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda C — docs/MISSION_PART66.md)
--
-- ⚠ NO APLICAR HASTA QUE EL CÓDIGO DE LA TANDA C ESTÉ DESPLEGADO. Es la
-- mitad de CONTRACCIÓN del expand-contract y va DESPUÉS del código, nunca
-- antes — misma regla que la 029, la 045 y la 049.
--
-- El riesgo es concreto y ya mordió una vez: `loadOfferRequirements`
-- (supabaseMappers.ts) leía esta tabla dentro de un `Promise.all` con un
-- `throwIfError` debajo. Dropearla con ese lector vivo no degrada nada, tumba
-- el listado de ofertas ENTERO — que es exactamente lo que documenta la 045
-- sobre `offer_required_aircraft_types`. El commit de la tanda C retira
-- lector y escritor a la vez; esta migración va después.
--
-- La sustituye `offers.technician_type` (migración 051): UN SOLO tipo por
-- oferta, NOT NULL, con FK al catálogo. Pedir dos tipos a la vez eran dos
-- puestos en un anuncio.
--
-- SIN dump previo, a diferencia de la 031: la tabla está vacía (0 filas,
-- verificado en vivo) y nunca llegó a tener datos reales — no hay nada que
-- volcar. La guarda de abajo aborta si eso deja de ser cierto.
-- ============================================================


DO $$
DECLARE
  v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows FROM public.offer_required_technician_types;
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'offer_required_technician_types tiene % filas. Migra esos valores a offers.technician_type antes de dropearla.',
      v_rows;
  END IF;

  -- Y la columna que la sustituye tiene que existir YA: dropear la vieja
  -- antes de que la 051 esté aplicada dejaría el sistema sin ninguna de las
  -- dos formas de expresar el tipo de una oferta.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='technician_type'
  ) THEN
    RAISE EXCEPTION 'Falta offers.technician_type. Aplica antes la migración 051.';
  END IF;
END $$;


-- SIN CASCADE, misma filosofía RESTRICT que la 030, la 031 y la 045: si algo
-- sigue dependiendo de la tabla, que Postgres aborte y lo averigüemos, no que
-- lo arrastre en silencio. Arrastra consigo sus 5 políticas RLS
-- (ort_select_published, ort_select_own_company, ort_insert_company,
-- ort_delete_company, ort_all_admin) y su FK a technician_types.
DROP TABLE IF EXISTS public.offer_required_technician_types;


DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='offer_required_technician_types'
  ) THEN
    RAISE EXCEPTION 'La tabla sigue existiendo tras el DROP.';
  END IF;

  RAISE NOTICE 'offer_required_technician_types retirada; offers.technician_type la sustituye.';
END $$;

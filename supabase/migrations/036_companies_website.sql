-- ============================================================
-- 036 — companies.website
--
-- Fecha: 2026-07-29. Contexto: barrido de campos fantasma
-- (docs/MISSION_PART66.md, Fase 5 / auditoría de specialties).
--
-- ── Por qué existe esta migración ─────────────────────────────────────
-- `Company.website` ya existía en el tipo TypeScript (src/types/company.ts)
-- pero SIN columna detrás: v2CompanyToV1() lo rellenaba con `''` hardcodeado.
-- Era el mismo patrón de campo fantasma que specialties, sólo que sin UI que
-- lo delatara. Aquí se resuelve en la dirección contraria a specialties: en
-- vez de retirar el campo, se le da el almacenamiento que le faltaba, porque
-- la web de una empresa SÍ es un dato real que el técnico quiere ver.
--
-- ── Visibilidad: sin gate, y es deliberado ────────────────────────────
-- Los social_links del TÉCNICO son privados (technician_public_view los tapa
-- con offer_accepted_between()). El website de la EMPRESA no lleva gate
-- ninguno, y no es una asimetría por descuido: la empresa no es anónima en
-- este producto — publica ofertas con su nombre. El anonimato protege al
-- técnico, no a quien contrata.
--
-- Esta migración NO toca políticas RLS: `companies_select_all` ya deja leer
-- las empresas verificadas a cualquier usuario activo, y `companies_update_own`
-- ya restringe la escritura al admin de la propia empresa. La columna hereda
-- exactamente eso. El bloque C lo verifica en vez de darlo por supuesto.
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. La columna ─────────────────────────────────────────────────────
-- NULLABLE y sin DEFAULT: "sin web declarada" es un estado legítimo y
-- permanente para muchos operadores pequeños, no un dato que falte por
-- rellenar. NULL, nunca ''. La app escribe NULL al vaciar el campo.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS website TEXT;


-- ── B. El CHECK de formato ────────────────────────────────────────────
-- Red de seguridad del servidor, no la validación de cara al usuario (esa
-- vive en src/utils/urlValidation.ts y es la que da mensajes legibles).
-- Deliberadamente más permisiva que el cliente en la forma del host, pero
-- innegociable en lo que de verdad importa:
--   - sólo http/https — un `javascript:` guardado aquí acabaría en un
--     Linking.openURL() del lado del técnico;
--   - sin espacios en blanco;
--   - host con punto y TLD alfabético de 2+ letras;
--   - '' rechazado explícitamente (el regex ya lo impide): la ausencia se
--     representa con NULL y de una sola forma.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.companies'::regclass
      AND conname  = 'chk_companies_website_format'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT chk_companies_website_format
      CHECK (
        website IS NULL
        OR (
          length(website) <= 2048
          AND website ~* '^https?://[^\s/?#]+\.[a-z]{2,}([/?#][^\s]*)?$'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.companies.website IS
  'Web pública de la empresa. NULL = no declarada (nunca ''''). Se persiste ya normalizada con esquema explícito (src/utils/urlValidation.ts). SIN gate de privacidad a propósito: la empresa no es anónima en este producto — lo visible bajo aceptación son los datos del técnico, no los de quien contrata. Editable sólo por el admin de la propia empresa vía la política companies_update_own.';


-- ── C. Comprobación de post-condiciones ───────────────────────────────
-- Verifica contra el catálogo, no contra el diff de este fichero.

DO $$
DECLARE
  has_col      BOOLEAN;
  has_check    BOOLEAN;
  n_policies   INTEGER;
  bad_rows     INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='companies'
                   AND column_name='website' AND is_nullable='YES') INTO has_col;
  IF NOT has_col THEN
    RAISE EXCEPTION '036 incompleta: companies.website no existe o no es NULLABLE. El NULL es el estado "sin web declarada", no un hueco.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.companies'::regclass
                   AND conname='chk_companies_website_format') INTO has_check;
  IF NOT has_check THEN
    RAISE EXCEPTION '036 incompleta: falta chk_companies_website_format. Sin el, un javascript: guardado aqui llega a un openURL del lado del tecnico.';
  END IF;

  -- Las 3 politicas que esta migracion NO debe haber tocado. Que la columna
  -- sea legible por los tecnicos y escribible solo por el admin de la
  -- empresa depende enteramente de que sigan ahi.
  SELECT count(*) INTO n_policies
    FROM pg_policy WHERE polrelid='public.companies'::regclass
      AND polname IN ('companies_all_admin','companies_select_all','companies_update_own');
  IF n_policies <> 3 THEN
    RAISE EXCEPTION '036 ABORTADA: se esperaban las 3 politicas RLS de companies y hay %. La visibilidad de website es exactamente la de la tabla.', n_policies;
  END IF;

  -- Deberia ser 0 siempre (columna recien creada), pero si la 036 se
  -- re-ejecuta sobre datos ya escritos, esto lo delata antes de que el CHECK
  -- falle de forma opaca.
  SELECT count(*) INTO bad_rows FROM public.companies WHERE website = '';
  IF bad_rows > 0 THEN
    RAISE EXCEPTION '036: % empresas con website = ''''. Debe ser NULL. Corrigelo antes de continuar.', bad_rows;
  END IF;

  RAISE NOTICE '036 OK — companies.website creada (nullable, con CHECK de formato http/https); las 3 politicas RLS de companies intactas.';
END $$;

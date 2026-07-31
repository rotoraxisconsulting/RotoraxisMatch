-- ============================================================
-- DUMP DE SEGURIDAD — public.aircraft_types
-- Tomado de rotoaxismatch-dev el 2026-07-28, INMEDIATAMENTE ANTES de la
-- migración 030 (supabase/migrations/030_drop_aircraft_types.sql), que
-- elimina esta tabla.
--
-- Contenido: 33 filas, las 33 con is_active = true. Estructura, constraints
-- y políticas RLS incluidas, de forma que este fichero por sí solo
-- restaura la tabla completa tal como estaba.
--
-- Qué NO restaura, a propósito: las dos claves foráneas que apuntaban aquí
-- (technician_habilitations.aircraft_type_code y
-- technician_aircraft_experience.aircraft_type_code). Las retiró la
-- migración 028 y la primera de esas columnas ya no existe (029). Restaurar
-- la tabla NO recrea ningún vínculo — es un dump de rescate de datos, no un
-- rollback de la fase.
--
-- Contexto de por qué se retira: catálogo de aeronaves pre-Part-66,
-- sustituido por aircraft_type_ratings (606 endorsements EASA reales,
-- migración 020). Cero lectores en src/ desde 2026-07-22.
-- Ver docs/MISSION_PART66.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aircraft_types (
  code              TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  manufacturer      TEXT,
  aircraft_family   TEXT,
  aircraft_category TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT aircraft_types_aircraft_category_check
    CHECK (aircraft_category = ANY (ARRAY['airplane'::text, 'helicopter'::text]))
);

INSERT INTO public.aircraft_types (code, label, manufacturer, aircraft_family, aircraft_category, is_active) VALUES
  ('A220', 'Airbus A220', 'Airbus', 'narrow_body', 'airplane', true),
  ('A318', 'Airbus A318', 'Airbus', 'narrow_body', 'airplane', true),
  ('A319', 'Airbus A319', 'Airbus', 'narrow_body', 'airplane', true),
  ('A320', 'Airbus A320', 'Airbus', 'narrow_body', 'airplane', true),
  ('A321', 'Airbus A321', 'Airbus', 'narrow_body', 'airplane', true),
  ('A330', 'Airbus A330', 'Airbus', 'wide_body', 'airplane', true),
  ('A340', 'Airbus A340', 'Airbus', 'wide_body', 'airplane', true),
  ('A350', 'Airbus A350 XWB', 'Airbus', 'wide_body', 'airplane', true),
  ('A380', 'Airbus A380', 'Airbus', 'wide_body', 'airplane', true),
  ('ATR42', 'ATR 42', 'ATR', 'turboprop', 'airplane', true),
  ('ATR72', 'ATR 72', 'ATR', 'turboprop', 'airplane', true),
  ('AW139', 'Leonardo AW139', 'Leonardo', 'helicopter', 'helicopter', true),
  ('B407', 'Bell 407', 'Bell', 'helicopter', 'helicopter', true),
  ('B412', 'Bell 412', 'Bell', 'helicopter', 'helicopter', true),
  ('B737', 'Boeing 737', 'Boeing', 'narrow_body', 'airplane', true),
  ('B747', 'Boeing 747', 'Boeing', 'wide_body', 'airplane', true),
  ('B757', 'Boeing 757', 'Boeing', 'narrow_body', 'airplane', true),
  ('B767', 'Boeing 767', 'Boeing', 'wide_body', 'airplane', true),
  ('B777', 'Boeing 777', 'Boeing', 'wide_body', 'airplane', true),
  ('B787', 'Boeing 787 Dreamliner', 'Boeing', 'wide_body', 'airplane', true),
  ('CRJ200', 'Bombardier CRJ-200', 'Bombardier', 'narrow_body', 'airplane', true),
  ('CRJ700', 'Bombardier CRJ-700', 'Bombardier', 'narrow_body', 'airplane', true),
  ('CRJ900', 'Bombardier CRJ-900', 'Bombardier', 'narrow_body', 'airplane', true),
  ('E175', 'Embraer E175', 'Embraer', 'narrow_body', 'airplane', true),
  ('E190', 'Embraer E190', 'Embraer', 'narrow_body', 'airplane', true),
  ('E195', 'Embraer E195', 'Embraer', 'narrow_body', 'airplane', true),
  ('H125', 'Airbus H125', 'Airbus Helicopters', 'helicopter', 'helicopter', true),
  ('H135', 'Airbus H135', 'Airbus Helicopters', 'helicopter', 'helicopter', true),
  ('H145', 'Airbus H145', 'Airbus Helicopters', 'helicopter', 'helicopter', true),
  ('Q400', 'Bombardier Q400', 'Bombardier', 'turboprop', 'airplane', true),
  ('R44', 'Robinson R44', 'Robinson', 'helicopter', 'helicopter', true),
  ('S76', 'Sikorsky S-76', 'Sikorsky', 'helicopter', 'helicopter', true),
  ('S92', 'Sikorsky S-92', 'Sikorsky', 'helicopter', 'helicopter', true)
ON CONFLICT (code) DO NOTHING;

-- RLS tal como estaba (migración 001): lectura pública del catálogo,
-- escritura solo admin.
ALTER TABLE public.aircraft_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_at_read  ON public.aircraft_types;
CREATE POLICY cat_at_read  ON public.aircraft_types FOR SELECT USING (true);

DROP POLICY IF EXISTS cat_at_admin ON public.aircraft_types;
CREATE POLICY cat_at_admin ON public.aircraft_types FOR ALL    USING (is_admin());

-- Verificación de restauración: debe devolver 33.
-- SELECT count(*) FROM public.aircraft_types;

-- 041 — disponibilidad binaria: se retira `available_from` y cambia el DEFAULT.
--
-- Intención: la disponibilidad pasa a DOS estados, sin fecha.
--     immediately = true   ->  "Open to offers"
--     immediately = false  ->  "Unavailable"
--
-- Por qué: el tercer estado no existía de verdad. `status` NUNCA se persistió
-- (cero de 7 filas tenían la clave); lo guardado era `immediately` y
-- `available_from`. Elegir "Open to offers" sin fecha se escribía como
-- `immediately=false, available_from=null` y al recargar volvía a derivarse
-- como "Unavailable": el técnico veía un estado que no había elegido. Y como
-- ninguna fila tenía fecha, el filtro "Open to offers" del lado empresa no
-- casaba jamás con nadie — un filtro decorativo.
--
-- Ningún dato cambia de significado: hoy 3 filas están en `true` (eran
-- "Available", pasan a "Open to offers") y 3 en `false` (siguen
-- "Unavailable"). Cero filas derivaban `open_to_offers`, así que no se pierde
-- ningún estado real. Es un renombrado, no una migración de valores.
--
-- ORDEN (expand-contract): el código dejó de leer y escribir `available_from`
-- ANTES de esta migración.

-- 1. Retirar la clave fantasma de las filas existentes.
--    Está presente en TODAS las filas aunque siempre valga NULL, así que sin
--    esto quedaría como campo muerto dentro del JSONB — justo el residuo que
--    esta tanda existe para eliminar.
UPDATE technician_profiles
   SET availability = availability - 'available_from'
 WHERE availability ? 'available_from';

-- 2. DEFAULT nuevo: un técnico nuevo nace "Open to offers".
--
--    Razón (2026-07-29): un pendiente de verificación no aparece en ningún
--    sitio de todas formas, así que el default no lo hace más ni menos
--    visible mientras espera. Lo que decide es el momento DESPUÉS: un técnico
--    ya verificado que completa su perfil y no toca la sección de
--    disponibilidad quedaría fuera de las búsquedas sin enterarse, y sin nada
--    que se lo diga. "Open to offers" falla de forma visible para su dueño
--    —lo ve en su propio perfil y lo cambia en un toque— mientras que
--    "Unavailable" falla en silencio.
--
--    Sólo afecta a filas NUEVAS; las existentes conservan su valor.
ALTER TABLE technician_profiles
  ALTER COLUMN availability
  SET DEFAULT '{"immediately": true, "contract_types": []}'::jsonb;

-- Post-condiciones.
DO $$
DECLARE
  v_con_clave int;
  v_default   text;
BEGIN
  SELECT count(*) INTO v_con_clave
    FROM technician_profiles WHERE availability ? 'available_from';
  IF v_con_clave <> 0 THEN
    RAISE EXCEPTION 'Quedan % filas con available_from', v_con_clave;
  END IF;

  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='technician_profiles'
     AND column_name='availability';

  IF v_default LIKE '%available_from%' THEN
    RAISE EXCEPTION 'El DEFAULT sigue mencionando available_from: %', v_default;
  END IF;
  IF v_default NOT LIKE '%"immediately": true%' THEN
    RAISE EXCEPTION 'El DEFAULT no nace Open to offers: %', v_default;
  END IF;

  -- Ninguna fila debe haber perdido su valor de immediately.
  IF EXISTS (SELECT 1 FROM technician_profiles WHERE NOT (availability ? 'immediately')) THEN
    RAISE EXCEPTION 'Alguna fila se quedo sin la clave immediately';
  END IF;
END $$;

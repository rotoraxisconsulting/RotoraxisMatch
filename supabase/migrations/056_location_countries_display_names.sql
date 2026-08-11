-- ============================================================
-- AviationJobTalent V2 — Migración 056: nombres de país para
-- desplegable, y UM fuera
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F1 — docs/MISSION_PART66.md)
--
-- Va aparte de la 055 y no dentro porque la 055 YA ESTÁ APLICADA. Regla del
-- proyecto: una migración aplicada no se edita, se corrige con otra.
--
-- POR QUÉ
-- La 055 sembró los nombres LITERALES del paquete `country-state-city`, que
-- es lo correcto para una semilla — cero invención, una sola fuente — pero
-- deja cadenas que en un desplegable se leen mal: 'Hong Kong S.A.R.',
-- 'Man (Isle of)', 'Papua new Guinea', 'Cote D''Ivoire (Ivory Coast)'.
-- Esta columna se pinta CRUDA desde Postgres (no hay diccionario de copy en
-- el cliente), así que lo que hay aquí es exactamente lo que ve el técnico.
--
-- ⚠ RENOMBRAR AQUÍ NO ROMPE NADA, y el motivo es de diseño, no suerte: la
-- clave de `location_countries` es el CÓDIGO ISO, no el nombre. Nada apunta
-- a `name`: `location_country_aliases` referencia `code`, y a día de hoy no
-- hay ni un lector de esta tabla en la aplicación. Si algún día algo empieza
-- a emparejar por nombre, ese algo está mal, no esta migración.
--
-- Cambian 32 de 250 nombres, en cinco grupos, todos justificados abajo.
-- NO se toca ni un centroide: el desencaje de Argelia y compañía lo resuelve
-- F2 ajustando el zoom al país, no moviendo el punto.
-- ============================================================


-- ── 1. Los nombres ─────────────────────────────────────────
--
-- El emparejamiento es por `code`, nunca por el nombre viejo: si alguien ya
-- hubiera tocado una de estas cadenas a mano, un UPDATE ... WHERE name = '...'
-- fallaría en silencio y dejaría el nombre malo puesto. Por código, no.
UPDATE public.location_countries lc
SET name = v.new_name
FROM (VALUES
  -- (a) Paréntesis y abreviaturas. Los 4 primeros son los pedidos
  --     explícitamente; el resto salió del barrido con el mismo criterio.
  ('CI', 'Côte d''Ivoire'),                  -- Cote D'Ivoire (Ivory Coast)
  ('HK', 'Hong Kong'),                       -- Hong Kong S.A.R.
  ('MO', 'Macao'),                           -- Macau S.A.R.
  ('IM', 'Isle of Man'),                     -- Man (Isle of)
  ('VA', 'Vatican City'),                    -- Vatican City State (Holy See)
  ('VG', 'British Virgin Islands'),          -- Virgin Islands (British)
  ('VI', 'United States Virgin Islands'),    -- Virgin Islands (US)
  ('MF', 'Saint Martin'),                    -- Saint-Martin (French part)
  ('SX', 'Sint Maarten'),                    -- Sint Maarten (Dutch part)

  -- (b) Capitalización rota. 'And' con mayúscula en mitad de la frase, y un
  --     'new' en minúscula que es una errata del paquete, no un estilo.
  ('AG', 'Antigua and Barbuda'),             -- Antigua And Barbuda
  ('KN', 'Saint Kitts and Nevis'),           -- Saint Kitts And Nevis
  ('SJ', 'Svalbard and Jan Mayen'),          -- Svalbard And Jan Mayen Islands
  ('TC', 'Turks and Caicos Islands'),        -- Turks And Caicos Islands
  ('TT', 'Trinidad and Tobago'),             -- Trinidad And Tobago
  ('VC', 'Saint Vincent and the Grenadines'),-- Saint Vincent And The Grenadines
  ('WF', 'Wallis and Futuna'),               -- Wallis And Futuna Islands
  ('PG', 'Papua New Guinea'),                -- Papua new Guinea

  -- (c) Diacríticos que el paquete se come. Mismo criterio que 'Côte
  --     d'Ivoire': el nombre correcto lleva tilde, y el desplegable la busca
  --     insensible a acentos igual que la API de ciudades de F2.
  ('AX', 'Åland Islands'),                   -- Aland Islands
  ('RE', 'Réunion'),                         -- Reunion
  ('ST', 'São Tomé and Príncipe'),           -- Sao Tome and Principe
  ('BL', 'Saint Barthélemy'),                -- Saint-Barthelemy

  -- (d) El artículo delante rompe el ORDEN del desplegable: 'The Bahamas'
  --     se ordena por la T, donde nadie lo busca.
  ('BS', 'Bahamas'),                         -- The Bahamas
  ('GM', 'Gambia'),                          -- The Gambia

  -- (e) Nombres desactualizados o ambiguos. Son renombres del MISMO país,
  --     con el mismo código ISO — el país no cambia, la cadena sí.
  ('SZ', 'Eswatini'),                        -- Swaziland (renombrado en 2018)
  ('MK', 'North Macedonia'),                 -- Macedonia (renombrado en 2019)
  ('CV', 'Cabo Verde'),                      -- Cape Verde (oficial desde 2013)
  ('TL', 'Timor-Leste'),                     -- East Timor
  ('PS', 'Palestine'),                       -- Palestinian Territory Occupied
  ('FJ', 'Fiji'),                            -- Fiji Islands
  ('PN', 'Pitcairn Islands'),                -- Pitcairn Island
  ('GG', 'Guernsey'),                        -- Guernsey and Alderney
  -- CG se queda ambiguo a secas ('Congo') junto a CD ('Democratic Republic
  -- of the Congo'): son dos países distintos y el desplegable tiene que
  -- distinguirlos sin que el técnico tenga que saber cuál es cuál.
  ('CG', 'Republic of the Congo')            -- Congo
) AS v(code, new_name)
WHERE lc.code = v.code
  AND lc.name IS DISTINCT FROM v.new_name;

-- Lo que NO se toca, y por qué, para que nadie lo "arregle" luego:
--   CC 'Cocos (Keeling) Islands' — el paréntesis es el nombre corto oficial
--      ISO y Keeling es el nombre alternativo, no una abreviatura. Quitarlo
--      haría el país MENOS reconocible, que es lo contrario del objetivo.
--   CD 'Democratic Republic of the Congo' — largo pero correcto y sin
--      ambigüedad.
--   BQ, HM, PM, BA — su 'and' en minúscula ya es el inglés correcto.


-- ── 2. UM fuera ────────────────────────────────────────────
--
-- 'United States Minor Outlying Islands' viene del paquete con coordenadas
-- (0, 0), que es Null Island y no su posición: son islas dispersas por el
-- Pacífico y el Caribe, sin centroide con sentido.
--
-- No se corrige la coordenada, se desactiva el país: no es un sitio donde
-- nadie trabaje de técnico de mantenimiento aeronáutico (son atolones
-- deshabitados, refugios de fauna y una base militar). Desactivándolo no
-- puede ser elegido, así que la coordenada mala nunca llega a un mapa y F2
-- no hereda el aviso.
--
-- Desactivar y no borrar es la regla de catálogo de siempre: si algún día
-- alguien lo tuviera seleccionado, su fila sigue resolviendo.
UPDATE public.location_countries
SET is_active = false
WHERE code = 'UM' AND is_active;


-- ── Post-condiciones ───────────────────────────────────────
--
-- Estas comprobaciones son el barrido convertido en regla: si una futura
-- migración vuelve a meter un 'S.A.R.' o un 'And', esto la para.
DO $$
DECLARE
  v_total   INT;
  v_active  INT;
  v_unique  INT;
  v_aliases INT;
  v_bad     TEXT;
BEGIN
  SELECT count(*) INTO v_total  FROM public.location_countries;
  IF v_total <> 250 THEN
    RAISE EXCEPTION 'location_countries tiene % filas, se esperaban 250.', v_total;
  END IF;

  -- Los renombres no pueden haber colapsado dos países en un nombre.
  SELECT count(DISTINCT name) INTO v_unique FROM public.location_countries;
  IF v_unique <> v_total THEN
    RAISE EXCEPTION 'Hay % nombres distintos para % países: dos han colisionado.', v_unique, v_total;
  END IF;

  -- Ni un punto: se fueron los 'S.A.R.' y no entró ningún 'U.S.'.
  SELECT string_agg(name, ', ') INTO v_bad
  FROM public.location_countries WHERE name LIKE '%.%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Nombres con abreviatura: %', v_bad;
  END IF;

  -- Ni un 'And' suelto, ni un artículo delante.
  SELECT string_agg(name, ', ') INTO v_bad
  FROM public.location_countries WHERE name LIKE '% And %' OR name LIKE 'The %';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Nombres con capitalización rota o artículo delante: %', v_bad;
  END IF;

  -- Paréntesis: sólo CC, y a propósito.
  SELECT string_agg(name, ', ') INTO v_bad
  FROM public.location_countries WHERE name LIKE '%(%' AND code <> 'CC';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Nombres con paréntesis además de CC: %', v_bad;
  END IF;

  -- UM fuera, y sólo UM.
  IF EXISTS (SELECT 1 FROM public.location_countries WHERE code = 'UM' AND is_active) THEN
    RAISE EXCEPTION 'UM sigue activo: su coordenada (0,0) puede llegar a un mapa.';
  END IF;
  SELECT count(*) INTO v_active FROM public.location_countries WHERE is_active;
  IF v_active <> 249 THEN
    RAISE EXCEPTION 'Hay % países activos, se esperaban 249 (250 menos UM).', v_active;
  END IF;

  -- Y lo que de verdad importa: el puente de F2 sigue entero. Si renombrar
  -- hubiera roto algo, sería aquí.
  SELECT count(*) INTO v_aliases
  FROM public.location_country_aliases a
  JOIN public.location_countries lc ON lc.code = a.country_code;
  IF v_aliases <> (SELECT count(DISTINCT country_name) FROM public.location_airports) THEN
    RAISE EXCEPTION 'El puente de alias ya no cubre los países de location_airports: % filas resuelven.', v_aliases;
  END IF;

  RAISE NOTICE
    'location_countries: 250 países, % activos, nombres únicos y sin abreviaturas; puente de % alias intacto.',
    v_active, v_aliases;
END $$;

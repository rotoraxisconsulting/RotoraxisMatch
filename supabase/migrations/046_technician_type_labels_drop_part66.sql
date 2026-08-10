-- 046 — las etiquetas de `technician_types` dejan de nombrar el marco EASA.
--
-- Intención: retirar "Part-66" del texto que ve el usuario, alineado con el
-- mismo cambio de copy hecho en app/ y src/. Estas dos etiquetas se pintan
-- tal cual en el selector de /auth/signup/technician (useTechnicianTypes ->
-- useCatalogOptions.ts lee label directamente de esta tabla), así que eran
-- el ÚNICO Part-66 de cara al usuario que no vivía en el código.
--
--     'Mechanic (Part-66 A / B1)'        -> 'Mechanic'
--     'Avionics Technician (Part-66 B2)' -> 'Avionics Technician'
--
-- Por qué: la plataforma va a admitir técnicos sin licencia EASA (FAA,
-- Latinoamérica). El paréntesis daba por hecho un marco regulatorio en el
-- primer punto donde alguien se da de alta, y a un técnico con licencia FAA
-- "A / B1" no le dice nada — o peor, le dice que ese hueco no es para él.
--
-- El paréntesis era decoración explicativa, no el dato: los códigos de
-- licencia (B1.1, B1.2...) siguen intactos donde SÍ son el valor —
-- license_categories, los chips del perfil y los requisitos de oferta. Aquí
-- lo único que se elige es el tipo de técnico.
--
-- Efecto colateral buscado: los nuevos valores coinciden ya exactamente con
-- TECHNICIAN_TYPES en src/constants/technicianTypes.ts, que es de donde lee
-- el resto de la app. Las dos fuentes dejan de contradecirse en estas dos
-- filas. (Queda una discrepancia conocida: 'painter' es 'Aircraft Painter'
-- aquí y 'Painter' en el catálogo TypeScript.)
--
-- Solo cambia texto de presentación: `code` es la PK y no se toca, así que
-- ninguna fila que referencie estos tipos se ve afectada. No hay orden
-- expand-contract que respetar — ningún código lee estas etiquetas por su
-- contenido, solo las muestra.

-- Idempotente y acotado por el texto de origen: si ya se aplicó, o si alguien
-- editó la etiqueta a mano, el WHERE no encuentra nada y no se pisa nada.
UPDATE technician_types
   SET label = 'Mechanic'
 WHERE code = 'mechanic'
   AND label = 'Mechanic (Part-66 A / B1)';

UPDATE technician_types
   SET label = 'Avionics Technician'
 WHERE code = 'avionic'
   AND label = 'Avionics Technician (Part-66 B2)';

-- Comprobación: que no quede ningún Part-66 en las etiquetas activas.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT count(*) INTO remaining
    FROM technician_types
   WHERE label ILIKE '%part-66%' OR label ILIKE '%part 66%';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'technician_types: quedan % etiquetas nombrando Part-66', remaining;
  END IF;
END $$;

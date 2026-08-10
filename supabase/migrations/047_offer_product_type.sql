-- 047 — una oferta es de aviones O de helicópteros, nunca de las dos cosas.
--
-- Intención: `offers.product_type` pasa a ser un dato declarado por la empresa
-- (primer campo del formulario), y el motor impide que los requisitos exactos
-- de esa oferta referencien ratings del otro producto.
--
-- Por qué en la base y no solo en el formulario: el filtro de hoy en
-- TypeRatingRequirementsEditor.tsx se deriva de la LICENCIA de cada fila
-- (getCompatibleProductType), y B2/B2L/C/L cubren ambos productos -> con B2
-- no se filtraba nada. Por ahí entraron ofertas tituladas "Helicópteros" con
-- requisitos B1.1/B1.2 (aviones). Una regla que solo vive en la pantalla
-- protege el ÚNICO camino que alguien pulsa; ésta tiene que valer para
-- cualquier escritura, presente o futura.
--
-- Cómo se impone: dos FK COMPUESTAS desde offer_required_habilitations.
--   (offer_id, product_type)              -> offers (id, product_type)
--   (aircraft_type_rating_id, product_type) -> aircraft_type_ratings (id, product_type)
-- La misma columna `product_type` de la fila hija tiene que casar a la vez con
-- la de su oferta y con la de su rating. Meter un rating de helicóptero en una
-- oferta de aviones es imposible a nivel de motor, no "improbable".
--
-- Gas Airship queda FUERA de las ofertas a propósito (3 filas del catálogo,
-- decisión tomada): el CHECK de `offers.product_type` solo admite
-- 'Aeroplane' y 'Helicopter', y como la fila hija hereda ese valor por la
-- primera FK, la segunda nunca podrá apuntar a un dirigible. No hace falta
-- un CHECK propio en la tabla hija.
--
-- Sin backfill: `offers` y `offer_required_habilitations` están vacías en dev
-- (verificado en vivo antes de escribir esto: 0 y 0). Las guardas de abajo
-- abortan la migración en vez de inventar un valor si eso deja de ser cierto.
--
-- Orden expand-contract: esta migración se aplica ANTES del código que lee o
-- escribe `product_type` (CLAUDE.md, "Schema first, code second").

-- ── 1. aircraft_type_ratings.product_type deja de admitir NULL ─────────────
-- Ya está poblada en las 606 filas (verificado: 0 nulls). Es requisito de la
-- UNIQUE de abajo: una clave con una columna nullable no sirve como destino
-- de FK con la garantía que buscamos.
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM aircraft_type_ratings WHERE product_type IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION
      'aircraft_type_ratings: % filas sin product_type; rellénalas antes de aplicar la 047', missing;
  END IF;
END $$;

ALTER TABLE aircraft_type_ratings ALTER COLUMN product_type SET NOT NULL;

-- Redundante frente a la PK (id) en cuanto a unicidad, pero necesaria: una FK
-- compuesta exige una restricción única EXACTAMENTE sobre las columnas
-- referenciadas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atr_id_product_type_key') THEN
    ALTER TABLE aircraft_type_ratings
      ADD CONSTRAINT atr_id_product_type_key UNIQUE (id, product_type);
  END IF;
END $$;

-- ── 2. offers.product_type ─────────────────────────────────────────────────
ALTER TABLE offers ADD COLUMN IF NOT EXISTS product_type text;

DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM offers WHERE product_type IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION
      'offers: % ofertas sin product_type. No hay backfill fiable — el producto no se puede deducir de los requisitos (una oferta sin requisitos exactos no dice nada, y una con B2 tampoco). Decide el valor a mano antes de aplicar la 047.', missing;
  END IF;
END $$;

ALTER TABLE offers ALTER COLUMN product_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_product_type_check') THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_product_type_check
      CHECK (product_type IN ('Aeroplane', 'Helicopter'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_id_product_type_key') THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_id_product_type_key UNIQUE (id, product_type);
  END IF;
END $$;

COMMENT ON COLUMN offers.product_type IS
  'Aviones o helicópteros, declarado por la empresa. Acota qué licencias y qué ratings puede pedir la oferta (FK compuestas en offer_required_habilitations). No participa en el scoring.';

-- ── 3. offer_required_habilitations.product_type + FK compuestas ───────────
-- Columna denormalizada a propósito: no es un dato nuevo (es el de la oferta y
-- el del rating a la vez), existe únicamente para que las dos FK compuestas
-- puedan cruzarse sobre ella. Ése es el mecanismo, no un efecto secundario.
ALTER TABLE offer_required_habilitations ADD COLUMN IF NOT EXISTS product_type text;

DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM offer_required_habilitations WHERE product_type IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION
      'offer_required_habilitations: % filas sin product_type; rellénalas desde aircraft_type_ratings antes de aplicar la 047', missing;
  END IF;
END $$;

ALTER TABLE offer_required_habilitations ALTER COLUMN product_type SET NOT NULL;

-- ON DELETE CASCADE igual que offer_required_habilitations_offer_id_fkey, que
-- ya existe sobre offer_id solo. Sin el CASCADE aquí, esta FK bloquearía el
-- DELETE real de ofertas sin dependientes que hace offerRepository.delete().
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orh_matches_offer') THEN
    ALTER TABLE offer_required_habilitations
      ADD CONSTRAINT orh_matches_offer
      FOREIGN KEY (offer_id, product_type)
      REFERENCES offers (id, product_type)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orh_matches_rating') THEN
    ALTER TABLE offer_required_habilitations
      ADD CONSTRAINT orh_matches_rating
      FOREIGN KEY (aircraft_type_rating_id, product_type)
      REFERENCES aircraft_type_ratings (id, product_type);
  END IF;
END $$;

COMMENT ON COLUMN offer_required_habilitations.product_type IS
  'Copia del product_type de la oferta Y del rating. Existe solo para que las FK compuestas orh_matches_offer / orh_matches_rating se crucen sobre ella: el escritor no elige este valor, lo hereda.';

-- Índice para la FK compuesta hacia el catálogo: el lado hijo de una FK no
-- obtiene índice automático, y esta pareja se recorre al validar cada insert.
CREATE INDEX IF NOT EXISTS idx_orh_rating_product_type
  ON offer_required_habilitations (aircraft_type_rating_id, product_type);

-- ── 4. Post-condiciones (dentro de la propia migración) ────────────────────
DO $$
DECLARE
  cols INT;
  fks  INT;
BEGIN
  SELECT count(*) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND is_nullable = 'NO'
     AND (
       (table_name = 'offers' AND column_name = 'product_type') OR
       (table_name = 'offer_required_habilitations' AND column_name = 'product_type') OR
       (table_name = 'aircraft_type_ratings' AND column_name = 'product_type')
     );
  IF cols <> 3 THEN
    RAISE EXCEPTION '047: se esperaban 3 columnas product_type NOT NULL, hay %', cols;
  END IF;

  SELECT count(*) INTO fks
    FROM pg_constraint
   WHERE conname IN ('orh_matches_offer', 'orh_matches_rating')
     AND contype = 'f';
  IF fks <> 2 THEN
    RAISE EXCEPTION '047: se esperaban las 2 FK compuestas, hay %', fks;
  END IF;
END $$;

-- 043 — `account_deletion_feedback`: por qué se va la gente.
--
-- Intención: el motivo de una baja sólo se puede preguntar MIENTRAS la persona
-- sigue ahí. Después no: el borrado destruye el email (dominio `.invalid`) y
-- las credenciales, así que no hay a quién escribir — y guardar la dirección
-- para preguntárselo luego contradiría la promesa de la política de privacidad
-- ("name, email, phone ... erased or anonymised within 30 days") y convertiría
-- una supresión ejercida en una lista de contacto.
--
-- Por eso esta tabla NO tiene `user_id` ni clave ajena a `profiles`. No es
-- descuido ni simplificación: es la única forma de que el dato sobreviva al
-- borrado POR CONSTRUCCIÓN en vez de a pesar de él. Con una FK a profiles el
-- ON DELETE CASCADE se lo llevaría (es exactamente lo que ya le pasa a
-- `user_consents`, corregido en la etiqueta de la migración 039); y con un
-- user_id sin FK tendríamos PII huérfana sobreviviendo a una supresión, que es
-- peor todavía.
--
-- Granularidad de DÍA, no de instante. `profiles.deleted_at` (migración 042)
-- guarda el momento exacto de la baja; si aquí guardáramos también un
-- timestamp exacto, cruzar ambas tablas devolvería el motivo atribuido a una
-- lápida concreta — y con él a su código anónimo, sus licencias y su
-- ubicación. La respuesta dejaría de ser anónima justo para quien tiene acceso
-- al panel. Con fecha de día la correlación deja de ser inmediata.
--   Riesgo residual, dicho sin adornos: con un solo borrado en todo el día la
--   correlación sigue siendo posible. A este volumen ninguna anonimización lo
--   evita del todo. Lo que NO se hace es prometer más de lo que se cumple: la
--   UI dice "not linked to your account", que es cierto, y no "anónimo", que
--   sería una exageración.
--
-- `goal_met_here` no es abandono, es ÉXITO: alguien que se da de baja porque
-- encontró trabajo (o contrató) a través del producto está reportando que
-- funcionó. Mezclarlo con el resto de la fuga haría ilegible la métrica.

CREATE TABLE IF NOT EXISTS public.account_deletion_feedback (
  id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  role       app_role NOT NULL,
  reason     TEXT     NOT NULL
               CHECK (reason IN (
                 'goal_met_here',
                 'goal_met_elsewhere',
                 'not_enough_supply',
                 'verification_slow',
                 'privacy_concerns',
                 'just_testing',
                 'other'
               )),
  comment    TEXT     CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_on DATE     NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE public.account_deletion_feedback IS
  'Motivo declarado al borrar la cuenta, recogido en el propio flujo de borrado. '
  'SIN user_id y SIN FK a propósito: debe sobrevivir a la supresión sin quedar '
  'atado a la persona. Sólo lo escribe la Edge Function delete-account con '
  'service_role, y sólo lo lee un admin.';

COMMENT ON COLUMN public.account_deletion_feedback.created_on IS
  'Fecha (día, no instante) para no permitir el cruce inmediato con '
  'profiles.deleted_at, que sí guarda el momento exacto.';

CREATE INDEX IF NOT EXISTS account_deletion_feedback_created_on_idx
  ON public.account_deletion_feedback (created_on DESC);

ALTER TABLE public.account_deletion_feedback ENABLE ROW LEVEL SECURITY;

-- Lectura: sólo admin.
DROP POLICY IF EXISTS adf_select_admin ON public.account_deletion_feedback;
CREATE POLICY adf_select_admin
  ON public.account_deletion_feedback FOR SELECT TO authenticated
  USING (is_admin());

-- Escritura: NINGUNA política, deliberadamente.
--
-- RLS deniega por defecto, así que la ausencia de política de INSERT es la
-- política: ni `authenticated` ni `anon` pueden escribir aquí. La única vía es
-- `service_role`, que salta RLS, y sólo la usa la Edge Function delete-account
-- justo antes de borrar el usuario. Consecuencia buscada: una respuesta en
-- esta tabla implica un borrado real, no un formulario que cualquiera pueda
-- cebar desde fuera.
--
-- Sin UPDATE ni DELETE por el mismo motivo: nadie corrige a posteriori lo que
-- alguien dijo al irse.

-- Doble cierre. Supabase concede por defecto todos los privilegios sobre las
-- tablas nuevas de `public` a `anon` y `authenticated` (comprobado: al crear
-- esta tabla ya tenían INSERT/UPDATE/DELETE). RLS lo bloquea igualmente, pero
-- dejar el GRANT abierto obliga a que la única defensa sea una política que
-- alguien podría añadir sin darse cuenta de lo que abre. Se retira el permiso
-- para que las dos capas digan lo mismo.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.account_deletion_feedback FROM anon, authenticated;
REVOKE SELECT ON public.account_deletion_feedback FROM anon;

GRANT SELECT ON public.account_deletion_feedback TO authenticated;
GRANT SELECT, INSERT ON public.account_deletion_feedback TO service_role;

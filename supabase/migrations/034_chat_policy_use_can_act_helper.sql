-- ============================================================
-- 034 — cm_msg_insert_company: usar can_act_for_company() en vez de
--        listar los roles inline
--
-- Fecha: 2026-07-28. Rationale: docs/MISSION_PART66.md.
--
-- El mismo concepto ("este usuario puede actuar en nombre de esta empresa")
-- tenía DOS expresiones dentro de la propia base de datos: el helper
-- `can_act_for_company()` y una lista de roles escrita a mano en el JOIN de
-- esta política. Cambiar el helper NO habría arrastrado el chat, que se
-- quedaría con la regla vieja en silencio. Misma clase de divergencia que la
-- 033 cerró entre TypeScript y BD, pero enteramente intra-BD.
--
-- ── EQUIVALENCIA: probada, no argumentada ──────────────────
-- La lista inline es REDUNDANTE. La política actual ya contiene, en el mismo
-- WHERE del EXISTS:
--
--     AND can_act_for_company(cr.company_id)
--
-- y `can_act_for_company(cid)` es literalmente:
--
--     SELECT role IN ('admin','recruiter')
--     FROM company_members WHERE user_id = auth.uid() AND company_id = cid
--
-- Es decir: la condición del JOIN (`mem.role = ANY(ARRAY['admin','recruiter'])`
-- sobre la fila de ESTE usuario en ESTA empresa) es exactamente la misma
-- condición que el helper ya evalúa. Quitarla no puede cambiar el resultado:
--
--   - admin/recruiter → JOIN casaba y helper true → permitido (antes y ahora)
--   - viewer          → antes el JOIN no casaba; ahora casa pero el helper
--                       devuelve false → denegado (antes y ahora)
--   - sin membresía   → no hay fila; el JOIN no casa en ninguno de los dos
--                       casos → denegado
--
-- NO es más permisiva. El único efecto es que `mem` deja de estar filtrado
-- por rol, y `mem` solo se usa para `sender_company_member_id = mem.id`.
--
-- Por qué eso es seguro: `company_members` tiene UNIQUE (company_id, user_id)
-- **y además** UNIQUE (user_id), así que un usuario tiene como máximo UNA
-- fila de membresía en total. `mem` no puede casar con dos filas, y el
-- subquery escalar de `can_act_for_company` no puede devolver múltiples
-- valores. (Verificado contra pg_constraint, no supuesto.)
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE.
-- ============================================================


-- ── A. La política, sin la lista inline ───────────────────────────────
-- Todo lo demás se reproduce EXACTAMENTE igual que la definición actual
-- (obtenida de pg_policies antes de escribir esto): remitente = usuario
-- autenticado, rol de remitente 'company', sala perteneciente a la empresa
-- de la sesión, y el miembro emisor declarado (si se declara) debe ser el
-- propio.

DROP POLICY IF EXISTS cm_msg_insert_company ON public.chat_messages;

CREATE POLICY cm_msg_insert_company ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    is_active_user()
    AND sender_user_id = auth.uid()
    AND sender_role = 'company'::sender_role
    AND EXISTS (
      SELECT 1
      FROM chat_rooms cr
      JOIN company_members mem
        ON mem.company_id = cr.company_id
       AND mem.user_id = auth.uid()
      WHERE cr.id = chat_messages.chat_room_id
        AND cr.company_id = my_company_id()
        -- Única expresión de "puede actuar por esta empresa". Si algún día
        -- cambia quién puede escribir en nombre de una empresa, se cambia
        -- can_act_for_company() y TODO lo que dependa de ello se mueve con
        -- él, incluido el chat. NO vuelvas a escribir la lista de roles aquí.
        AND can_act_for_company(cr.company_id)
        AND (
          chat_messages.sender_company_member_id IS NULL
          OR chat_messages.sender_company_member_id = mem.id
        )
    )
  );


-- ── B. Comprobación de post-condiciones ───────────────────────────────

DO $$
DECLARE
  regla TEXT;
BEGIN
  SELECT coalesce(with_check::text, '') INTO regla
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'cm_msg_insert_company';

  IF regla IS NULL OR regla = '' THEN
    RAISE EXCEPTION '034 ABORTADA: cm_msg_insert_company no existe o no tiene WITH CHECK.';
  END IF;

  -- La lista inline ya no debe estar.
  IF regla ~ 'role = ANY' OR regla ~ '''recruiter''::company_member_role' THEN
    RAISE EXCEPTION '034 incompleta: la politica sigue listando roles inline. Debe delegar en can_act_for_company().';
  END IF;

  -- El helper sí debe seguir estando: sin él la politica seria MAS PERMISIVA
  -- (cualquier miembro, incluido un viewer, podria escribir).
  IF regla NOT LIKE '%can_act_for_company%' THEN
    RAISE EXCEPTION '034 ABORTADA: la politica ya no llama a can_act_for_company() — seria MAS PERMISIVA que la anterior.';
  END IF;

  -- Las otras garantías de la política, que la reescritura podría perder.
  IF regla NOT LIKE '%my_company_id()%'
     OR regla NOT LIKE '%sender_user_id = auth.uid()%'
     OR regla NOT LIKE '%sender_company_member_id%'
     OR regla NOT LIKE '%is_active_user()%' THEN
    RAISE EXCEPTION '034 ABORTADA: la reescritura perdio alguna condicion de la politica original.';
  END IF;

  RAISE NOTICE '034 OK — cm_msg_insert_company delega en can_act_for_company(); sin lista de roles inline; resto de condiciones intactas.';
END $$;

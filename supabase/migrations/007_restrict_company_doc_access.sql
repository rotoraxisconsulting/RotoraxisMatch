-- ============================================================
-- RotoraxisMatch V2 — Migration 007: Restrict company document access
-- ============================================================
-- Created: 2026-06-05
--
-- Replaces docs_select_company to exclude medical certificates
-- and identity documents from company visibility.
--
-- Rationale: medical data is a GDPR Art. 9 special category
-- (health data) and requires explicit consent beyond simply
-- accepting a match. Identity documents carry similar risk.
--
-- Documents visible to companies after a match is accepted:
--   license   ✅ — required for aviation regulatory compliance
--   training  ✅ — professional certification
--   resume    ✅ — explicitly uploaded to share
--   other     ✅ — generic, low-sensitivity
--   medical   ❌ — health data, GDPR Art. 9
--   id        ❌ — sensitive personal document
-- ============================================================

DROP POLICY IF EXISTS docs_select_company ON public.documents;

CREATE POLICY docs_select_company ON public.documents
  FOR SELECT USING (
    auth_role()   = 'company_user'
    AND is_active_user()
    AND documents.status = 'verified'
    AND documents.type NOT IN ('medical', 'id')
    AND (
      EXISTS (
        SELECT 1 FROM public.offer_requests orq
        WHERE orq.company_id        = my_company_id()
          AND orq.technician_id     = documents.technician_id
          AND orq.documents_unlocked = true
      )
      OR EXISTS (
        SELECT 1 FROM public.offer_applications oa
        WHERE oa.company_id        = my_company_id()
          AND oa.technician_id     = documents.technician_id
          AND oa.documents_unlocked = true
      )
    )
  );

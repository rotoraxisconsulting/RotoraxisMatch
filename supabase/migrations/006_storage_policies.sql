-- ============================================================
-- RotoraxisMatch V2 — Migration 006: Storage policies
-- ============================================================
-- Created: 2026-06-05
--
-- Row Level Security policies for the technician-documents
-- Supabase Storage bucket.
--
-- PREREQUISITE: create the bucket manually in Supabase Dashboard
--   before applying these policies:
--     Storage → New bucket
--     Name:   technician-documents
--     Public: OFF  (private bucket — signed URLs only)
--
-- Storage path structure:  {technician_profile_id}/{uid}.{ext}
--
-- Access matrix:
--   Technician  INSERT  own folder ({their technician_profile_id}/*)
--   Technician  SELECT  own folder (to generate signed URLs)
--   Technician  DELETE  own folder
--   Admin       SELECT  entire bucket (to generate signed URLs)
--   Admin       DELETE  entire bucket
--   Company     —       no access (documents are revealed only through
--                       the documents table RLS, not raw Storage)
-- ============================================================


-- ── Technician: upload to own folder ─────────────────────────

CREATE POLICY "tech_upload_own_docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'technician-documents'
    AND EXISTS (
      SELECT 1 FROM public.technician_profiles tp
      JOIN  public.profiles p ON p.id = tp.user_id
      WHERE tp.id::text = (storage.foldername(name))[1]
        AND tp.user_id  = auth.uid()
        AND p.status    = 'active'
    )
  );


-- ── Technician: read/download own files ──────────────────────

CREATE POLICY "tech_read_own_docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'technician-documents'
    AND EXISTS (
      SELECT 1 FROM public.technician_profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND user_id   = auth.uid()
    )
  );


-- ── Technician: delete own files ─────────────────────────────

CREATE POLICY "tech_delete_own_docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'technician-documents'
    AND EXISTS (
      SELECT 1 FROM public.technician_profiles
      WHERE id::text = (storage.foldername(name))[1]
        AND user_id   = auth.uid()
    )
  );


-- ── Admin: read all files ─────────────────────────────────────

CREATE POLICY "admin_read_all_docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'technician-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ── Admin: delete any file ────────────────────────────────────

CREATE POLICY "admin_delete_all_docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'technician-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ── Company: read verified + unlocked documents ───────────────
--
-- Mirrors docs_select_company on the documents table.
-- Condition: the company has an accepted offer_request or
-- offer_application with documents_unlocked = true for this
-- technician. documents_unlocked is set automatically by the
-- acceptance trigger in migration 001.

CREATE POLICY "company_read_unlocked_verified_docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'technician-documents'
    AND public.auth_role()     = 'company_user'
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = name
        AND d.status        = 'verified'
        AND d.type NOT IN ('medical', 'id')
        AND (
          EXISTS (
            SELECT 1 FROM public.offer_requests orq
            WHERE orq.company_id        = public.my_company_id()
              AND orq.technician_id     = d.technician_id
              AND orq.documents_unlocked = true
          )
          OR EXISTS (
            SELECT 1 FROM public.offer_applications oa
            WHERE oa.company_id        = public.my_company_id()
              AND oa.technician_id     = d.technician_id
              AND oa.documents_unlocked = true
          )
        )
    )
  );

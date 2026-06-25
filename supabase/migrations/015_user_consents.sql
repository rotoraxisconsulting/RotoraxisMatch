-- ============================================================
-- AviationJobTalent V2 — Migration 015: User Consents
-- ============================================================
-- Adds:
--   1. 'deleted' value to user_status enum
--   2. user_consents table for GDPR audit trail
--      (tos_privacy at signup, medical_document at upload)
-- ============================================================


-- ── 1. Extend user_status enum ────────────────────────────
-- Enum values cannot be removed once added; safe to add.
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted';


-- ── 2. user_consents ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_consents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type    TEXT        NOT NULL
                    CHECK (consent_type IN ('tos_privacy', 'medical_document')),
  consent_version TEXT        NOT NULL DEFAULT '2025-06',
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One record per (user, type, version) — re-accepting the same version is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS user_consents_user_type_version_idx
  ON user_consents(user_id, consent_type, consent_version);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Users can record their own consent.
CREATE POLICY "user_consents: owner insert"
  ON user_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own consent records.
CREATE POLICY "user_consents: owner select"
  ON user_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can read all consent records.
CREATE POLICY "user_consents: admin select"
  ON user_consents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

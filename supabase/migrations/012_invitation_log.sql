-- ============================================================
-- AviationJobTalent V2 — Migration 012: Invitation log for rate limiting
-- ============================================================
-- Created: 2026-06-06
--
-- Supports rate limiting in the invite-company-member Edge Function.
-- Tracks every successful invitation so the function can enforce:
--   - Max 10 invitations per inviter per hour
--   - Max 20 invitations per company per day
--   - Max 3 invitations to the same email address per 24 hours
--
-- The table is written exclusively by the Edge Function (service role,
-- which bypasses RLS). RLS is enabled with an admin-only policy so
-- no client can read or write this table directly.
--
-- Old rows are not automatically purged in MVP — a daily cron or
-- manual cleanup can truncate rows older than 30 days when needed.
-- ============================================================

CREATE TABLE company_invitation_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_email TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes used by the three rate-limit COUNT queries
CREATE INDEX idx_invite_log_inviter ON company_invitation_log (inviter_id,    created_at DESC);
CREATE INDEX idx_invite_log_company ON company_invitation_log (company_id,    created_at DESC);
CREATE INDEX idx_invite_log_email   ON company_invitation_log (invited_email, created_at DESC);

-- RLS: deny all client access; service role bypasses automatically
ALTER TABLE company_invitation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_log_admin ON company_invitation_log FOR ALL USING (is_admin());

-- ============================================================
-- AviationJobTalent V2 — Migration 024: technician_public_view excludes
-- technicians whose parent profiles row is deleted/blocked/suspended
-- ============================================================
-- Created: 2026-07-22
-- Applied: 2026-07-22 against rotoaxismatch-dev, approved by the user
-- after the pending_verification correction below. Post-apply
-- verification (simulated authenticated company session): deleted
-- technician invisible (0), a real active technician still visible (1).
--
-- Problem being fixed (found by the user auditing Supabase directly,
-- 2026-07-22): account deletion (supabase/functions/delete-account)
-- anonymizes technician_profiles PII and sets profiles.status='deleted',
-- but profiles.status was never consulted by ANY read path — search,
-- the map, offer-candidate ranking/matching (getPublicProfiles), and
-- single-technician detail views (getSafeView/getViewForCompany/
-- getPublicWithRelations) all go through technician_public_view, whose
-- only filter is `WHERE is_active_user()` — that checks the REQUESTING
-- user's own profiles.status (auth.uid()), never the target technician's
-- (tp.user_id). A deleted technician stayed fully searchable, matchable,
-- and contactable. Live-verified against rotoaxismatch-dev: 1 deleted
-- technician (id 6146de18-5e8f-4d4a-8780-d42f1bf299c5) still had
-- verification_status='verified' and was still resolvable through this
-- view with no code changes at all.
--
-- Scope, corrected 2026-07-22 (an earlier draft of this migration used a
-- status='active'-only allow-list — the user caught that this would have
-- hidden every newly-signed-up, not-yet-admin-verified technician from
-- search/map/matching, a real product change disguised as a security fix):
-- profiles.status has 5 values (pending_verification/active/blocked/
-- suspended/deleted). handle_new_user() (migration 001) inserts every new
-- profiles row with NO explicit status, so it takes the column default —
-- 'pending_verification' — for every signup, technician or company.
-- admin_update_technician_verification (migration 010) is the only thing
-- that ever moves a technician off that: verified -> active, pending ->
-- pending_verification (no-op), rejected -> suspended. So
-- 'pending_verification' is not a transient signup step that resolves
-- itself — it is the normal, indefinite state of an unverified technician,
-- and today's (broken) view already shows them. The fix here must not
-- change that: it excludes 'deleted'/'blocked'/'suspended' only, keeping
-- both 'active' and 'pending_verification' visible — closing the actual
-- reported bug without silently hiding unverified technicians, who were
-- never the problem. Zero rows affected differently in current dev data
-- either way (0 blocked/suspended/pending_verification technicians as of
-- this writing) — this is forward-looking correctness, not a behavior
-- change against today's data beyond the 1 deleted row.
--
-- What this does NOT touch (deliberately):
--   - The technician's own self-access (RLS tp_select_own on
--     technician_profiles directly, bypassing this view) — moot for a
--     deleted user anyway, since delete-account also destroys their
--     auth.users row; they can never authenticate again.
--   - Admin visibility: the admin dashboard
--     (technicianRepositoryV2.getAll(), useAdminDashboard.ts) reads
--     technician_profiles directly under the is_admin() RLS policies,
--     never through this view — admins keep full visibility of
--     deleted/blocked/suspended accounts for support/audit, unaffected
--     by this migration.
--   - Company account deletion has an analogous, NOT yet audited
--     question (does a deleted company's remaining offers/data stay
--     visible to technicians the same broken way?) — out of scope here,
--     flagged separately for the user, not fixed in this migration.
-- ============================================================

CREATE OR REPLACE VIEW technician_public_view AS
 SELECT tp.id,
    tp.anonymous_code,
    compute_age(tp.birth_date) AS age,
    tp.technician_type,
    tp.location_city_id,
    loc.country_name AS country,
    loc.city,
    COALESCE(loc.iata, loc.icao) AS base_airport,
    loc.latitude,
    loc.longitude,
    tp.availability,
    tp.verification_status,
    tp.profile_completeness,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.first_name
            ELSE NULL::text
        END AS first_name,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.last_name
            ELSE NULL::text
        END AS last_name,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.email
            ELSE NULL::text
        END AS email,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.social_links
            ELSE NULL::jsonb
        END AS social_links
   FROM ((technician_profiles tp
     JOIN location_airports loc ON ((loc.id = tp.location_city_id)))
     JOIN profiles p ON ((p.id = tp.user_id)))
  WHERE is_active_user() AND p.status IN ('active', 'pending_verification');

COMMENT ON VIEW technician_public_view IS
  'Company-facing technician discovery/detail view. Excludes technicians whose profiles.status is deleted/blocked/suspended (migration 024) — those are invisible to every reader of this view (search, map, matching/offer-candidates, single-technician detail). Not-yet-admin-verified technicians (status=pending_verification) stay visible, same as before this migration — only the deleted/blocked/suspended states were the bug. Does not affect admin access (technicianRepositoryV2.getAll() reads technician_profiles directly) or the technician''s own RLS self-access.';

-- ============================================================
-- Verification note
-- ============================================================
-- No embedded post-apply DO block here on purpose: this view's own WHERE
-- clause depends on is_active_user() -> auth.uid(), which is NULL outside
-- a real PostgREST/authenticated request context (e.g. a migration
-- runner, or a raw superuser/service-role SQL connection) — querying the
-- view from such a context returns zero rows unconditionally, which would
-- make any naive "SELECT ... FROM technician_public_view" check inside
-- this file pass trivially regardless of whether the fix actually works
-- (verified this empirically before writing this migration).
--
-- Real verification instead simulates an authenticated active
-- company_user session (SET LOCAL request.jwt.claim.sub / role) inside a
-- transaction that gets ROLLED BACK, so nothing here touches live data —
-- see the checkpoint report presented alongside this file for the actual
-- before/after query results (deleted technician: visible before this
-- fix, invisible after; a real active technician: still visible in both
-- cases).


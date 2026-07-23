# RLS Operation Audit — 2026-07-23

**Scope:** task 2b of the post-Fase-3b hardening pass. For every table with
RLS enabled, list which operations (SELECT/INSERT/UPDATE/DELETE) have a
policy and which don't; cross-reference against what the app code actually
executes (or will predictably execute) against that table; flag gaps by
severity. **This is a report — no fix has been applied.** Proposed fixes go
in migration 025 after explicit sign-off, per protocol.

**Method:** read all 24 migration files in `supabase/migrations/` in
chronological order (later migrations can add/drop/replace a policy defined
in an earlier one — the ledger below is the *net current* state, not a
per-migration diff) and cross-referenced against `supabase/functions/`.
Then, for every table, grepped the actual codebase (`app/`, `src/`) for
`.from('<table>')` chained with `.insert(`/`.update(`/`.delete(`/`.upsert(`,
including the 11 screens that call `src/lib/supabase.ts` directly instead of
going through a repository (a separate architecture note, §6). Every "zero
call sites" claim below was verified with a plain-text `grep -rn` across
both `app/` and `src/` — an earlier pass using a different search tool
missed two real call sites, corrected before writing this report.

---

## 1. HIGH severity — active bug, reachable today

### 1.1 `offers` has no DELETE policy for the owning company — "Delete offer" silently does nothing

**Policies:** `offers_select_published` (SELECT), `offers_select_own`
(SELECT), `offers_insert_company` (INSERT), `offers_update_company`
(UPDATE), `offers_all_admin` (ALL, admin only). **No DELETE policy for a
non-admin company user.**

**Where the app calls it:** `app/company/offers/[id].tsx:256-266`
(`deleteOffer()`), wired to a real "Delete offer" button (line 528) behind a
destructive confirmation dialog ("This action cannot be undone. All
applications and direct offers linked to this offer will also be
removed."). It calls `offerRepository.delete(id)`
(`src/repositories/v2/offerRepository.ts:210-216`):

```ts
async delete(id: string): Promise<void> {
  const { error } = await supabase.from('offers').delete().eq('id', id);
  throwIfError(error);
},
```

**What actually happens:** RLS doesn't raise an error when a DELETE matches
zero rows because no policy grants access — it just deletes nothing.
`error` is `null`, `throwIfError(null)` is a no-op, and the screen does
`router.replace('/company/offers')` believing it succeeded. The offer is
**not deleted** and reappears the next time the list loads. No error toast,
no console warning — completely silent.

**Secondary, independent problem in the same feature** (would surface the
moment #1.1 is fixed): the confirm dialog promises direct offers linked to
the offer are "also removed." `offer_applications.offer_id` is
`ON DELETE CASCADE` (true), and so is `offer_required_habilitations.offer_id`
and the three `offer_required_*` broad-filter tables (true) — but
`offer_requests.offer_id` is `ON DELETE SET NULL` (migration 001, line 762):
a direct offer tied to a deleted offer survives as a generic (offer-less)
direct offer instead of being removed, contradicting the dialog's own copy.

**Proposed fix (migration 025, on your OK):** add
`offers_delete_company FOR DELETE USING (is_active_user() AND can_act_for_company(company_id))`,
mirroring `offers_update_company`. Separately (product decision, not just
RLS): decide whether a surviving generic direct offer is acceptable, or
whether deleting an offer should first withdraw/cancel its linked
`offer_requests` explicitly in the repository (RLS fix alone won't change
the `ON DELETE SET NULL` behavior).

---

## 2. MEDIUM severity — same shape as the `tl_update_own` gap (migration 021), currently latent

These are structurally identical to the bug already found and fixed this
phase (technician_licenses had SELECT/INSERT/DELETE "own row" policies since
migration 001 but no UPDATE, because the original save path never used
UPDATE — until it started to, and RLS silently rejected it). The same
"policy was written for the write pattern that existed at the time, nobody
revisits it when the pattern changes" root cause recurs below, just without
an active call site yet — meaning the bug is dormant, not yet biting a real
user.

### 2.1 `technician_aircraft_experience` has no UPDATE policy

**Policies:** `tae_select_own`, `tae_insert_own`, `tae_delete_own` (own
row), `tae_select_company`, `tae_all_admin`. **No UPDATE for the owning
technician.**

**Where the app calls it:**
`technicianRepositoryV2.updateExperienceYears()`
(`src/repositories/v2/technicianRepositoryV2.ts:394-405`) does a raw
`.update({ value, unit }).eq('technician_id', ...)`. Its only caller is
`useTechnicianDashboard.updateProfile()`
(`src/state/useTechnicianDashboard.ts:104-135`) — which is itself already
known dead V1 code with **zero call sites** (confirmed independently here;
matches the existing Fase 5 inventory item "useTechnicianDashboard.
updateProfile() — código muerto V1, cero call sites, eliminar"). So: 0
exposure today. The moment anyone wires a "years of experience" quick-edit
directly to this method (or revives the dead hook), the write will silently
affect 0 rows — same silent-failure shape as §1.1, just without an error
surfaced anywhere because nothing checks the row count either.

### 2.2 `documents` has no DELETE policy for the owning technician

**Policies:** `docs_select_own`, `docs_insert_own` (own row),
`docs_select_company`, `docs_all_admin`. **No DELETE for the owning
technician.**

**Where the app calls it:** `documentRepositoryV2.remove(id)`
(`src/repositories/v2/documentRepositoryV2.ts:77-81`) does a raw
`.delete().eq('id', id)`. **Zero call sites anywhere** — no "delete
document" UI exists today in `app/technician/documents.tsx` or elsewhere.
Fully dormant.

Worth noting for whoever builds this feature: Supabase **Storage** already
has a `tech_delete_own_docs` policy (migration 006) letting a technician
delete their own uploaded *file*. The `documents` table row has no matching
DELETE policy. If someone wires up file deletion using only the storage
side (a very natural first pass), the file disappears but the DB row
(`storage_path` pointing at a now-missing file) stays forever, showing up in
`getForTechnician()`/`getAll()` as an orphaned, broken document reference.

---

## 3. LOW-but-real — active today, silent, no user-visible symptom (which is why nobody noticed)

### 3.1 `user_consents` upsert on a second medical document can silently fail to record consent

**Policies:** `"user_consents: owner insert"` (INSERT, own),
`"user_consents: owner select"` / `"...: admin select"` (SELECT). **No
UPDATE policy for anyone, including admin** — this is deliberate: the table
comment describes it as a GDPR audit trail, and immutability is the point.

**Where the app calls it:** `app/technician/documents.tsx:196-203`:

```ts
await supabase.from('user_consents').upsert(
  { user_id: user.id, consent_type: 'medical_document', consent_version: CONSENT_VERSION },
  { onConflict: 'user_id,consent_type,consent_version' },
);
```

No `ignoreDuplicates: true`, and the result (`{ error }`) is **never
destructured or checked** — the `await` is fire-and-forget. Supabase's
default upsert without `ignoreDuplicates` compiles to
`INSERT ... ON CONFLICT (...) DO UPDATE SET ...`, which requires an UPDATE
policy the moment a conflict is actually hit. The UNIQUE index is
`(user_id, consent_type, consent_version)` — so this only conflicts on a
**second** `medical`-type document upload within the same consent version
(a first-time consent for that version is a plain INSERT and works fine).
A technician uploading a second medical document today: the document itself
uploads successfully (`documentRepositoryV2.add()`, unaffected), but the
consent upsert is rejected by RLS and the error vanishes silently — the
audit trail simply doesn't reflect that second consent event.

The same call shape exists twice more, for `tos_privacy` at signup
(`app/auth/signup/technician.tsx:145`, `app/auth/signup/company.tsx:116`) —
much lower risk in practice since `user_id` is freshly created at signup and
essentially never already has a row to conflict with, but identically
brittle if a signup flow is ever retried for the same user.

**Proposed fix (no schema change, no migration needed):** add
`ignoreDuplicates: true` to all three upserts, matching the pattern
`activityRepository.markRead()` already uses for the same "idempotent
insert, nothing meaningful to update on conflict" shape. This avoids adding
an UPDATE policy to a table that's deliberately insert-only, and the payload
has no field an update would actually need to change anyway (re-consenting
to the same version is a no-op by definition). Also worth checking the
`{ error }` this time, given the current silent-failure history.

---

## 4. Regression note — not a new finding, a rediscovery

While testing `offerApplicationRepository.create()` for task 2a, found it
never checks its own table for an existing application before inserting
(only checked for a conflicting *direct offer*). Before writing it up as a
new bug: `docs/V2_S0B_H6_ONE_APPLICATION_PER_OFFER_REPORT.md` (2026-05-31)
already decided and implemented **exactly this rule** — "one application
per technician per offer, regardless of status, reapplication out of scope"
— back when this repository read/wrote a local JSON array instead of real
Supabase. That guard clause did not survive the rewrite to live queries; the
UI half of H6's fix (`canApply = !existingApp`, `app/technician/offers/[id]
.tsx`) did survive intact, so the symptom was invisible in the UI (no Apply
button ever reappears) — only a direct/duplicate repository call (or a
future UI change) would have hit the gap. Already fixed in this session's
2a work (`evaluateApplicationConflict`, commit `6fa6ec4`), restoring H6's
original rule rather than inventing a new one — documented in the function's
own comment now so this doesn't get rediscovered a third time. Mentioned
here because it's exactly the kind of "write path drifted after the
Supabase port and nobody had coverage to catch it" issue this audit is
for.

---

## 5. Confirmed SAFE — checked explicitly so these don't get re-audited

- **`technician_habilitations`** — no UPDATE policy, and that's correct:
  `replaceHabilitations()` only ever does delete(own)+insert(own), both
  policies present (`th_delete_own`, `th_insert_own`). Matches migration
  021's own note; independently reverified against the current repository
  code, not just re-read from the comment.
- **`profiles`** — no non-admin UPDATE policy at all (`profiles_update_own`
  was dropped in migration 008, never replaced). Confirmed correct: the
  table's only columns (`id`, `email`, `role`, `status`, `created_at`) are
  all either server-owned (`role`/`status`, changed only via SECURITY
  DEFINER RPCs) or sourced from `auth.users`/immutable. Verified no code
  path anywhere attempts `.from('profiles').update()` as a non-admin.
- **`is_active_user()` gating almost every policy in the schema** (it
  requires the *caller's own* `profiles.status = 'active'`, including on
  policies for reading their own rows) initially looked like it could lock
  every `pending_verification` technician/company out of their own data —
  that status is documented (migration 024) as the normal, often
  multi-day state of a freshly-signed-up, not-yet-admin-verified account.
  Checked directly: `app/technician/_layout.tsx` and `app/company/_layout.tsx`
  both independently redirect to `/auth/pending-verification` (a fully
  static screen, zero data reads) whenever `profile.status !== 'active'`,
  *before* any nested screen mounts — so a pending account never actually
  reaches a screen that would hit this RLS wall. Not a bug. Worth noting as
  a fragile invariant, though: nothing besides convention enforces that a
  *future* top-level route remembers the same guard — there's no shared
  layout, lint rule, or test tying "reads one of these tables" to "has the
  status gate." A note for whoever adds the next route group, not an
  action item now.
- **`company_members` role change / removal** — `cm_update_admin` /
  `cm_delete_admin` RLS policies alone would let any company admin
  demote/remove the *last* admin (bypassing the last-admin guard that
  lives in the `update_company_member_role`/`remove_company_member` RPCs).
  Confirmed this is closed at the DB level regardless of path: migration
  011's `guard_company_member_last_admin` BEFORE UPDATE OR DELETE trigger
  enforces the same invariant unconditionally, so a raw RLS-permitted write
  (bypassing the RPC) is caught too.
- **Catalog tables** (`technician_types`, `license_categories`,
  `aircraft_types`, `company_types`, `contract_types`, `location_airports`,
  `aircraft_type_ratings`) — public read / admin write. Confirmed zero
  non-admin write attempts anywhere in the app.
- **`offer_required_technician_types`/`offer_required_licenses`/
  `offer_required_aircraft_types`/`offer_required_habilitations`** — no
  UPDATE policy on any of them, and that's correct: `offerRepository.
  replaceRequirements()`/`replaceRequiredHabilitations()` only ever do
  delete(company)+insert(company), and both verbs have matching policies.
- **`technician_licenses` UPDATE** — the gap that started this whole audit
  (migration 021) — reconfirmed fixed and matches the actual
  `upsertLicenses()` call shape.
- **Signup path** (`signup_technician`/`signup_company`, migration 002) —
  SECURITY DEFINER RPCs, bypass RLS entirely. `tp_insert_own` (the RLS
  policy that would otherwise govern this) is consequently never exercised
  by the real app — harmless unused policy, not a gap, just noise.
- **New company member status** — checked whether a member invited into an
  *already-verified* company would get stuck in `pending_verification`
  purgatory (since `admin_update_company_verification` only syncs
  `profiles.status` for the company's admin members at verification time,
  not for members added afterward). Confirmed handled:
  `supabase/functions/invite-company-member/index.ts` explicitly sets
  `status: 'active'` on the invited member's profile at invite time
  (service-role, bypasses RLS). Not a bug.

---

## 6. Adjacent finding, not RLS — architecture rule violation (CLAUDE.md)

CLAUDE.md requires screens go through a repository, never call
`src/lib/supabase.ts` directly. 11 files do today:
`app/technician/profile.tsx`, `app/company/index.tsx`,
`app/technician/index.tsx`, `app/auth/set-password.tsx`,
`app/technician/documents.tsx`, `app/auth/signup/company.tsx`,
`app/auth/signup/technician.tsx`, `app/account/delete.tsx`,
`app/admin/index.tsx`, `app/company/direct-offers/index.tsx`,
`app/auth/forgot-password.tsx`. Most are read-only dashboard counters or
`supabase.auth.*` calls (outside RLS-per-table scope). One is worth a
dedicated cleanup pass: `app/technician/profile.tsx`'s main-profile-row save
(`handleSave()`, line ~476) duplicates `technicianRepositoryV2.update()`
instead of calling it — and since `technicianRepositoryV2.update()`'s only
other caller is the same already-dead `useTechnicianDashboard.updateProfile()`
noted in §2.1, the repository method that exists for exactly this purpose is
bypassed by its one real, live caller. Not an RLS gap (both paths hit the
same `tp_update_own` policy, so no data-layer bug) — flagged here as
architecture erosion found along the way, separate from this audit's scope.

---

## 7. Minor hygiene note (unrelated to RLS)

Two migration files are both numbered `014`
(`014_dedup_technician_profiles.sql`, `014_remove_member_deletes_user.sql`).
Both are applied and harmless (Supabase orders by full filename, so there's
no real execution-order ambiguity) — flagged only because it could confuse
tooling or a future contributor scanning by number.

---

## Summary table

| Table | Missing policy | Reachable today? | Severity | Fix needs |
|---|---|---|---|---|
| `offers` | DELETE (company) | **Yes — live button** | **High** | Migration 025 + product decision on `offer_requests` cascade |
| `technician_aircraft_experience` | UPDATE (own) | No (dead-code caller only) | Medium | Migration 025 |
| `documents` | DELETE (own) | No (no UI yet) | Medium | Migration 025, when the feature is built |
| `user_consents` | n/a (upsert shape, not a policy gap) | **Yes — 2nd medical doc upload** | Low-but-real | Code-only fix, `ignoreDuplicates: true` |

No migration has been written or applied. Awaiting your go-ahead on which
of these to fix and how, before touching migration 025.

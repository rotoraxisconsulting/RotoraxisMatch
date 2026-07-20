// Pure planning logic for technicianRepositoryV2.removeUnreferencedLicenses()
// — no Supabase import, unit-tested directly (see scripts/testMatching.ts).
//
// technician_habilitations references technician_licenses via a composite
// FK (technician_id, license_code) — fk_technician_habilitations_license,
// migration 016/018. A candidate license removal that's still referenced by
// a habilitation must never be deleted (the FK would reject it anyway) —
// it has to be reported back so the caller can tell the technician why,
// instead of surfacing a database error or, worse, deleting the
// habilitation out from under them to force the removal through.
export interface LicenseEntry {
  code: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface LicenseRemovalPlan {
  // Candidate codes safe to delete — nothing still references them.
  deletes: string[];
  // Candidate codes that CANNOT be deleted because a habilitation still
  // references them.
  blocked: string[];
}

export function planLicenseRemoval(candidateCodes: string[], dependentCodes: string[]): LicenseRemovalPlan {
  const dependentSet = new Set(dependentCodes);
  return {
    deletes: candidateCodes.filter((c) => !dependentSet.has(c)),
    blocked: candidateCodes.filter((c) => dependentSet.has(c)),
  };
}

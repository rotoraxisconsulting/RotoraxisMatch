// Validity-date order check for license/habilitation issuedAt/expiresAt
// pairs (Fase 3 vigencia). Absent issuedAt or expiresAt is neutral — never
// flagged, per the same "missing data never penalizes" rule the matching
// scorer follows; only an explicit expiresAt on or before issuedAt is
// invalid, and that must surface as a UI message, never a database error.
export function isValidDateOrder(issuedAt: string | undefined, expiresAt: string | undefined): boolean {
  if (!issuedAt || !expiresAt) return true;
  // ISO 'YYYY-MM-DD' strings compare correctly with plain string
  // comparison — no need to parse into Date objects.
  return expiresAt > issuedAt;
}

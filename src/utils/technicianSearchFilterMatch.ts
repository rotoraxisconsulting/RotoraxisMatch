export interface TechnicianSearchIdentity {
  technicianTypes: readonly string[];
  locationCountryCode: string;
  locationCityGeonameId?: number;
  country: string;
  city: string;
}

export interface TechnicianSearchIdentityFilters {
  technicianTypes?: readonly string[];
  countryCode?: string;
  cityGeonameId?: number;
  /** Legacy/manual fallback when no stable catalog identifier is available. */
  country?: string;
  city?: string;
}

/**
 * Pure matching for the profile dimensions selected from catalog-backed UI.
 * Multiple trades are OR-matched: sharing any selected trade is sufficient.
 */
export function matchesTechnicianSearchIdentity(
  technician: TechnicianSearchIdentity,
  filters: TechnicianSearchIdentityFilters,
): boolean {
  if (
    filters.technicianTypes?.length &&
    !filters.technicianTypes.some((type) => technician.technicianTypes.includes(type))
  ) {
    return false;
  }
  if (filters.countryCode && technician.locationCountryCode !== filters.countryCode) return false;
  if (
    filters.cityGeonameId !== undefined &&
    technician.locationCityGeonameId !== filters.cityGeonameId
  ) {
    return false;
  }
  if (filters.country && technician.country !== filters.country) return false;
  if (filters.city && technician.city !== filters.city) return false;
  return true;
}

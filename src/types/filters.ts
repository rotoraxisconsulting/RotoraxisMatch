export interface MapFilters {
  licenseCategory?: string;
  aircraftType?: string;
  verificationStatus?: string;
}

export interface TechnicianFilters {
  licenseCategory?: string;
  aircraftType?: string;
  specialty?: string;
  availabilityStatus?: string;
  verificationStatus?: string;
  minYearsExperience?: number;
  country?: string;
  city?: string;
  baseAirport?: string;
  contractType?: string;
  availableFrom?: string;
}

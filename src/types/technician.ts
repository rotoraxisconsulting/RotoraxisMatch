export type VerificationStatus = 'verified' | 'pending' | 'unverified';

export type AvailabilityStatus = 'available' | 'open_to_offers' | 'unavailable';

export type ContractType = 'permanent' | 'contract' | 'temporary' | 'freelance';

export interface Availability {
  status: AvailabilityStatus;
  contractTypes: ContractType[];
  availableFrom?: string;
}

export interface Technician {
  id: string;
  anonymousCode: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  baseAirport: string;
  latitude: number;
  longitude: number;
  licenseCategories: string[];
  aircraftTypes: string[];
  specialties: string[];
  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;
  yearsExperience: number;
}

export type SafeTechnicianView = Omit<Technician, 'fullName' | 'email' | 'phone'> & {
  matchingScore?: number;
  fullName?: string;
  email?: string;
  phone?: string;
};

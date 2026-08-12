import type { ContractTypeCode } from './catalog';
import type { OfferProductType } from './offer';
import type { OfferRequestStatus } from './enums';
import type { MapPinPrecision } from '../utils/locationBridge';

export type OfferMapMatchBand = 'excellent' | 'strong' | 'partial' | 'weak';

export interface OfferMapFilters {
  contractTypes?: ContractTypeCode[];
  productTypes?: OfferProductType[];
  matchBands?: OfferMapMatchBand[];
  eligibleOnly?: boolean;
}

export interface OfferMapItem {
  id: string;
  title: string;
  companyName: string;
  contractType: ContractTypeCode;
  productType: OfferProductType;
  location: string;
  latitude: number;
  longitude: number;
  locationPrecision: MapPinPrecision;
  score: number;
  matchLabel: string;
  blockers: string[];
  applicationStatus?: OfferRequestStatus;
}

export function getOfferMapMatchBand(score: number): OfferMapMatchBand {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'partial';
  return 'weak';
}

export function activeOfferMapFilterCount(filters: OfferMapFilters): number {
  return (
    (filters.contractTypes?.length ?? 0) +
    (filters.productTypes?.length ?? 0) +
    (filters.matchBands?.length ?? 0) +
    (filters.eligibleOnly ? 1 : 0)
  );
}

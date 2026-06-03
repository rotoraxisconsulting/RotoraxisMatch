import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { Offer, OfferWithRequirements } from '../../types/offer';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../types/catalog';
import { OfferStatus } from '../../types/enums';
import { resolveLocationSnapshot } from '../../constants/locationCities';

interface OfferRequiredTechnicianType { id: string; offerId: string; technicianTypeCode: TechnicianTypeCode; }
interface OfferRequiredLicense        { id: string; offerId: string; licenseCode: LicenseCode; }
interface OfferRequiredAircraftType   { id: string; offerId: string; aircraftTypeCode: string; }

type OfferLocationInput = {
  locationCityId?: string;
  locationCountry?: string;
  locationCity?: string;
  locationBaseAirport?: string;
};

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeOfferLocation<T extends Partial<Offer>>(offer: T): T {
  const location = resolveLocationSnapshot({
    locationCityId: offer.locationCityId,
    country: offer.locationCountry,
    city: offer.locationCity,
    baseAirport: offer.locationBaseAirport,
  });

  if (!location) return offer;

  return {
    ...offer,
    locationCityId: location.locationCityId,
    locationCountry: location.country,
    locationCity: location.city,
    locationBaseAirport: location.baseAirport,
  };
}

function hasOfferLocationPatch(patch: Partial<Offer>): boolean {
  return (
    patch.locationCityId !== undefined ||
    patch.locationCountry !== undefined ||
    patch.locationCity !== undefined ||
    patch.locationBaseAirport !== undefined
  );
}

function controlledOfferLocation(reference: OfferLocationInput): Pick<Offer, 'locationCityId' | 'locationCountry' | 'locationCity' | 'locationBaseAirport'> {
  const location = resolveLocationSnapshot({
    locationCityId: reference.locationCityId,
    country: reference.locationCountry,
    city: reference.locationCity,
    baseAirport: reference.locationBaseAirport,
  });

  if (!location) {
    throw new Error('Offer location must reference a valid catalog city.');
  }

  return {
    locationCityId: location.locationCityId,
    locationCountry: location.country,
    locationCity: location.city,
    locationBaseAirport: location.baseAirport,
  };
}

export function isOfferOpenForTechnicians(offer: Pick<Offer, 'status' | 'visible'> | null | undefined): boolean {
  return Boolean(offer && offer.status === 'published' && offer.visible);
}

export const offerRepository = {
  async getAll(): Promise<Offer[]> {
    const offers = await storageAdapter.get<Offer[]>(DB_KEYS.v2Offers) ?? [];
    return offers.map(normalizeOfferLocation);
  },

  async getById(id: string): Promise<Offer | null> {
    const offers = await this.getAll();
    return offers.find((o) => o.id === id) ?? null;
  },

  async getPublished(): Promise<Offer[]> {
    const offers = await this.getAll();
    return offers.filter(isOfferOpenForTechnicians);
  },

  async getForCompany(companyId: string): Promise<Offer[]> {
    const offers = await this.getAll();
    return offers.filter((o) => o.companyId === companyId);
  },

  async getWithRequirements(id: string): Promise<OfferWithRequirements | null> {
    const offer = await this.getById(id);
    if (!offer) return null;

    const [types, licenses, aircraft] = await Promise.all([
      storageAdapter.get<OfferRequiredTechnicianType[]>(DB_KEYS.v2OfferRequiredTechnicianTypes) ?? [],
      storageAdapter.get<OfferRequiredLicense[]>(DB_KEYS.v2OfferRequiredLicenses) ?? [],
      storageAdapter.get<OfferRequiredAircraftType[]>(DB_KEYS.v2OfferRequiredAircraftTypes) ?? [],
    ]);

    return {
      ...offer,
      requiredTechnicianTypes: (types as OfferRequiredTechnicianType[]).filter((t) => t.offerId === id).map((t) => t.technicianTypeCode),
      requiredLicenses: (licenses as OfferRequiredLicense[]).filter((l) => l.offerId === id).map((l) => l.licenseCode),
      requiredAircraftTypes: (aircraft as OfferRequiredAircraftType[]).filter((a) => a.offerId === id).map((a) => a.aircraftTypeCode),
    };
  },

  async getAllWithRequirements(): Promise<OfferWithRequirements[]> {
    const offers = await this.getAll();
    return Promise.all(offers.map((o) => this.getWithRequirements(o.id) as Promise<OfferWithRequirements>));
  },

  async getPublishedWithRequirements(): Promise<OfferWithRequirements[]> {
    const all = await this.getAllWithRequirements();
    return all.filter(isOfferOpenForTechnicians);
  },

  async updateStatus(id: string, status: OfferStatus): Promise<Offer | null> {
    const offers = await this.getAll();
    const idx = offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const updated: Offer = normalizeOfferLocation({ ...offers[idx], status, visible: status === 'published', updatedAt: new Date().toISOString() });
    const next = [...offers];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Offers, next);
    return updated;
  },

  async update(id: string, patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Promise<Offer | null> {
    const offers = await this.getAll();
    const idx = offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const merged = { ...offers[idx], ...patch, updatedAt: new Date().toISOString() };
    const locationPatch = hasOfferLocationPatch(patch)
      ? controlledOfferLocation(
          patch.locationCityId !== undefined
            ? {
                locationCityId: patch.locationCityId,
                locationCountry: patch.locationCountry,
                locationCity: patch.locationCity,
                locationBaseAirport: patch.locationBaseAirport,
              }
            : merged,
        )
      : {};
    const updated: Offer = normalizeOfferLocation({ ...merged, ...locationPatch });
    const next = [...offers];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Offers, next);
    return updated;
  },

  async create(data: {
    companyId: string;
    title: string;
    description: string;
    contractType: ContractTypeCode;
    locationCityId: string;
    locationCountry?: string;
    locationCity?: string;
    locationBaseAirport?: string;
    minYearsExperience: number;
    status?: OfferStatus;
    requiredTechnicianTypes?: TechnicianTypeCode[];
    requiredLicenses?: LicenseCode[];
    requiredAircraftTypes?: string[];
  }): Promise<OfferWithRequirements> {
    const offers = await this.getAll();
    const now = new Date().toISOString();
    const id = `offer-${uuid()}`;
    const status = data.status ?? 'draft';
    const location = controlledOfferLocation(data);

    const offer: Offer = {
      id,
      companyId: data.companyId,
      title: data.title,
      description: data.description,
      contractType: data.contractType,
      ...location,
      minYearsExperience: data.minYearsExperience,
      status,
      visible: status === 'published',
      createdAt: now,
      updatedAt: now,
    };

    await storageAdapter.set(DB_KEYS.v2Offers, [...offers, offer]);

    const reqTypes = data.requiredTechnicianTypes ?? [];
    const reqLicenses = data.requiredLicenses ?? [];
    const reqAircraft = data.requiredAircraftTypes ?? [];

    await this.replaceRequirements(id, {
      technicianTypes: reqTypes,
      licenses: reqLicenses,
      aircraftTypes: reqAircraft,
    });

    return { ...offer, requiredTechnicianTypes: reqTypes, requiredLicenses: reqLicenses, requiredAircraftTypes: reqAircraft };
  },

  async replaceRequirements(offerId: string, requirements: {
    technicianTypes: TechnicianTypeCode[];
    licenses: LicenseCode[];
    aircraftTypes: string[];
  }): Promise<void> {
    const [allTypes, allLicenses, allAircraft] = await Promise.all([
      storageAdapter.get<OfferRequiredTechnicianType[]>(DB_KEYS.v2OfferRequiredTechnicianTypes) ?? [],
      storageAdapter.get<OfferRequiredLicense[]>(DB_KEYS.v2OfferRequiredLicenses) ?? [],
      storageAdapter.get<OfferRequiredAircraftType[]>(DB_KEYS.v2OfferRequiredAircraftTypes) ?? [],
    ]);

    const filteredTypes = (allTypes as OfferRequiredTechnicianType[]).filter((t) => t.offerId !== offerId);
    const filteredLicenses = (allLicenses as OfferRequiredLicense[]).filter((l) => l.offerId !== offerId);
    const filteredAircraft = (allAircraft as OfferRequiredAircraftType[]).filter((a) => a.offerId !== offerId);

    const newTypes: OfferRequiredTechnicianType[] = requirements.technicianTypes.map((code, i) => ({
      id: `${offerId}-type-${i}`,
      offerId,
      technicianTypeCode: code,
    }));
    const newLicenses: OfferRequiredLicense[] = requirements.licenses.map((code, i) => ({
      id: `${offerId}-lic-${i}`,
      offerId,
      licenseCode: code,
    }));
    const newAircraft: OfferRequiredAircraftType[] = requirements.aircraftTypes.map((code, i) => ({
      id: `${offerId}-acft-${i}`,
      offerId,
      aircraftTypeCode: code,
    }));

    await Promise.all([
      storageAdapter.set(DB_KEYS.v2OfferRequiredTechnicianTypes, [...filteredTypes, ...newTypes]),
      storageAdapter.set(DB_KEYS.v2OfferRequiredLicenses, [...filteredLicenses, ...newLicenses]),
      storageAdapter.set(DB_KEYS.v2OfferRequiredAircraftTypes, [...filteredAircraft, ...newAircraft]),
    ]);
  },
};

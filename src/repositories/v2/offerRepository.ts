import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { Offer, OfferWithRequirements } from '../../types/offer';
import { TechnicianTypeCode, LicenseCode } from '../../types/catalog';
import { OfferStatus } from '../../types/enums';

interface OfferRequiredTechnicianType { id: string; offerId: string; technicianTypeCode: TechnicianTypeCode; }
interface OfferRequiredLicense        { id: string; offerId: string; licenseCode: LicenseCode; }
interface OfferRequiredAircraftType   { id: string; offerId: string; aircraftTypeCode: string; }

export const offerRepository = {
  async getAll(): Promise<Offer[]> {
    return await storageAdapter.get<Offer[]>(DB_KEYS.v2Offers) ?? [];
  },

  async getById(id: string): Promise<Offer | null> {
    const offers = await this.getAll();
    return offers.find((o) => o.id === id) ?? null;
  },

  async getPublished(): Promise<Offer[]> {
    const offers = await this.getAll();
    return offers.filter((o) => o.status === 'published' && o.visible);
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
    return all.filter((o) => o.status === 'published' && o.visible);
  },

  async updateStatus(id: string, status: OfferStatus): Promise<Offer | null> {
    const offers = await this.getAll();
    const idx = offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const updated: Offer = { ...offers[idx], status, updatedAt: new Date().toISOString() };
    const next = [...offers];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Offers, next);
    return updated;
  },

  async update(id: string, patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Promise<Offer | null> {
    const offers = await this.getAll();
    const idx = offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const updated: Offer = { ...offers[idx], ...patch, updatedAt: new Date().toISOString() };
    const next = [...offers];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Offers, next);
    return updated;
  },
};

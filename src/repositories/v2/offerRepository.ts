import { supabase } from '../../lib/supabase';
import { Offer, OfferWithRequirements } from '../../types/offer';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../types/catalog';
import { OfferStatus } from '../../types/enums';
import { resolveLocationSnapshot } from '../../constants/locationCities';
import {
  loadOfferRequirements,
  mapOfferRow,
  throwIfError,
  withRequirements,
} from './supabaseMappers';

type OfferLocationInput = {
  locationCityId?: string;
  locationCountry?: string;
  locationCity?: string;
  locationBaseAirport?: string;
};

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

function hasOfferLocationPatch(patch: Partial<Offer>): boolean {
  return (
    patch.locationCityId !== undefined ||
    patch.locationCountry !== undefined ||
    patch.locationCity !== undefined ||
    patch.locationBaseAirport !== undefined
  );
}

function offerPatchToDb(patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Record<string, unknown> {
  return {
    ...(patch.companyId !== undefined ? { company_id: patch.companyId } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.contractType !== undefined ? { contract_type: patch.contractType } : {}),
    ...(patch.locationCityId !== undefined ? { location_city_id: patch.locationCityId } : {}),
    ...(patch.locationCountry !== undefined ? { location_country: patch.locationCountry } : {}),
    ...(patch.locationCity !== undefined ? { location_city: patch.locationCity } : {}),
    ...(patch.locationBaseAirport !== undefined ? { location_base_airport: patch.locationBaseAirport } : {}),
    ...(patch.minYearsExperience !== undefined ? { min_years_experience: patch.minYearsExperience } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
    ...(patch.expiresAt !== undefined ? { expires_at: patch.expiresAt ?? null } : {}),
  };
}

export function isOfferOpenForTechnicians(offer: Pick<Offer, 'status' | 'visible'> | null | undefined): boolean {
  return Boolean(offer && offer.status === 'published' && offer.visible);
}

export const offerRepository = {
  async getAll(): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getById(id: string): Promise<Offer | null> {
    const { data, error } = await supabase
      .from('offers')
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRow(data as any) : null;
  },

  async getPublished(): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .eq('status', 'published')
      .eq('visible', true)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getForCompany(companyId: string): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getWithRequirements(id: string): Promise<OfferWithRequirements | null> {
    const offer = await this.getById(id);
    if (!offer) return null;
    const reqs = await loadOfferRequirements([id]);
    return withRequirements(offer, reqs[id]);
  },

  async getAllWithRequirements(): Promise<OfferWithRequirements[]> {
    const offers = await this.getAll();
    const reqs = await loadOfferRequirements(offers.map((o) => o.id));
    return offers.map((offer) => withRequirements(offer, reqs[offer.id]));
  },

  async getPublishedWithRequirements(): Promise<OfferWithRequirements[]> {
    const offers = await this.getPublished();
    const reqs = await loadOfferRequirements(offers.map((o) => o.id));
    return offers.map((offer) => withRequirements(offer, reqs[offer.id]));
  },

  async updateStatus(id: string, status: OfferStatus): Promise<Offer | null> {
    const { data, error } = await supabase
      .from('offers')
      .update({ status, visible: status === 'published' })
      .eq('id', id)
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRow(data as any) : null;
  },

  async update(id: string, patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Promise<Offer | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const locationPatch = hasOfferLocationPatch(patch)
      ? controlledOfferLocation({ ...existing, ...patch })
      : {};
    const { data, error } = await supabase
      .from('offers')
      .update(offerPatchToDb({ ...patch, ...locationPatch }))
      .eq('id', id)
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRow(data as any) : null;
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
    const status = data.status ?? 'draft';
    const location = controlledOfferLocation(data);
    const { data: inserted, error } = await supabase
      .from('offers')
      .insert({
        company_id: data.companyId,
        title: data.title,
        description: data.description,
        contract_type: data.contractType,
        location_city_id: location.locationCityId,
        location_country: location.locationCountry,
        location_city: location.locationCity,
        location_base_airport: location.locationBaseAirport,
        min_years_experience: data.minYearsExperience,
        status,
        visible: status === 'published',
      })
      .select('id, company_id, title, description, contract_type, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at')
      .single();
    throwIfError(error);

    const offer = mapOfferRow(inserted as any);
    const requirements = {
      technicianTypes: data.requiredTechnicianTypes ?? [],
      licenses: data.requiredLicenses ?? [],
      aircraftTypes: data.requiredAircraftTypes ?? [],
    };
    await this.replaceRequirements(offer.id, requirements);
    return {
      ...offer,
      requiredTechnicianTypes: requirements.technicianTypes,
      requiredLicenses: requirements.licenses,
      requiredAircraftTypes: requirements.aircraftTypes,
    };
  },

  async replaceRequirements(offerId: string, requirements: {
    technicianTypes: TechnicianTypeCode[];
    licenses: LicenseCode[];
    aircraftTypes: string[];
  }): Promise<void> {
    const deletes = await Promise.all([
      supabase.from('offer_required_technician_types').delete().eq('offer_id', offerId),
      supabase.from('offer_required_licenses').delete().eq('offer_id', offerId),
      supabase.from('offer_required_aircraft_types').delete().eq('offer_id', offerId),
    ]);
    deletes.forEach((result) => throwIfError(result.error));

    const inserts = [];
    if (requirements.technicianTypes.length > 0) {
      inserts.push(
        supabase.from('offer_required_technician_types').insert(
          requirements.technicianTypes.map((code) => ({ offer_id: offerId, technician_type_code: code })),
        ),
      );
    }
    if (requirements.licenses.length > 0) {
      inserts.push(
        supabase.from('offer_required_licenses').insert(
          requirements.licenses.map((code) => ({ offer_id: offerId, license_code: code })),
        ),
      );
    }
    if (requirements.aircraftTypes.length > 0) {
      inserts.push(
        supabase.from('offer_required_aircraft_types').insert(
          requirements.aircraftTypes.map((code) => ({ offer_id: offerId, aircraft_type_code: code })),
        ),
      );
    }
    const results = await Promise.all(inserts);
    results.forEach((result) => throwIfError(result.error));
  },
};

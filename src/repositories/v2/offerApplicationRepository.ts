import { supabase } from '../../lib/supabase';
import { OfferApplication } from '../../types/offerRequest';
import { OfferRequestStatus } from '../../types/enums';
import { isActiveOfferRelationStatus } from '../../utils/offerRelationStateMachine';
import { isOfferOpenForTechnicians, offerRepository } from './offerRepository';
import { mapOfferApplicationRow, mapOfferRequestRow, throwIfError } from './supabaseMappers';

const SELECT_FIELDS = 'id, technician_id, offer_id, company_id, status, identity_revealed, documents_unlocked, cover_note, created_at, updated_at';

export const offerApplicationRepository = {
  async getAll(): Promise<OfferApplication[]> {
    const { data, error } = await supabase
      .from('offer_applications')
      .select(SELECT_FIELDS)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferApplicationRow);
  },

  async getById(id: string): Promise<OfferApplication | null> {
    const { data, error } = await supabase
      .from('offer_applications')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferApplicationRow(data as any) : null;
  },

  async getForTechnician(technicianId: string): Promise<OfferApplication[]> {
    const { data, error } = await supabase
      .from('offer_applications')
      .select(SELECT_FIELDS)
      .eq('technician_id', technicianId)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferApplicationRow);
  },

  async getForOffer(offerId: string): Promise<OfferApplication[]> {
    const { data, error } = await supabase
      .from('offer_applications')
      .select(SELECT_FIELDS)
      .eq('offer_id', offerId)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferApplicationRow);
  },

  async getForCompany(companyId: string): Promise<OfferApplication[]> {
    const { data, error } = await supabase
      .from('offer_applications')
      .select(SELECT_FIELDS)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferApplicationRow);
  },

  async create(data: {
    technicianId: string;
    offerId: string;
    companyId: string;
    coverNote?: string;
  }): Promise<OfferApplication> {
    const offer = await offerRepository.getById(data.offerId);
    if (!isOfferOpenForTechnicians(offer) || offer?.companyId !== data.companyId) {
      throw new Error('This offer is no longer available.');
    }

    const { data: existingRequests, error: reqError } = await supabase
      .from('offer_requests')
      .select('id, company_id, technician_id, offer_id, status, identity_revealed, documents_unlocked, message, created_at, updated_at')
      .eq('company_id', data.companyId)
      .eq('technician_id', data.technicianId)
      .eq('offer_id', data.offerId);
    throwIfError(reqError);
    const activeRequest = ((existingRequests ?? []) as any[])
      .map(mapOfferRequestRow)
      .find((request) => isActiveOfferRelationStatus(request.status));
    if (activeRequest) {
      throw new Error('You already have a direct offer for this role. Review it from Direct Offers.');
    }

    const { data: inserted, error } = await supabase
      .from('offer_applications')
      .insert({
        technician_id: data.technicianId,
        offer_id: data.offerId,
        company_id: data.companyId,
        cover_note: data.coverNote ?? null,
      })
      .select(SELECT_FIELDS)
      .single();
    throwIfError(error);
    return mapOfferApplicationRow(inserted as any);
  },

  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferApplication | null> {
    const { data, error } = await supabase
      .from('offer_applications')
      .update({ status })
      .eq('id', id)
      .select(SELECT_FIELDS)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferApplicationRow(data as any) : null;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferApplication | null> {
    const app = await this.getById(id);
    if (!app || app.technicianId !== technicianId) return null;
    if (app.status !== 'pending') throw new Error('Only pending applications can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};

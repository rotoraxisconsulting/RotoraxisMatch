import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { OfferApplication, OfferRequest } from '../../types/offerRequest';
import { OfferRequestStatus } from '../../types/enums';
import { chatRepository } from './chatRepository';
import { activityRepository } from './activityRepository';
import { isOfferOpenForTechnicians, offerRepository } from './offerRepository';
import {
  assertOfferRelationTransition,
  getStatusActivityType,
  isActiveOfferRelationStatus,
  shouldUnlockAcceptedRelation,
} from '../../utils/offerRelationStateMachine';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const offerApplicationRepository = {
  async getAll(): Promise<OfferApplication[]> {
    return await storageAdapter.get<OfferApplication[]>(DB_KEYS.v2OfferApplications) ?? [];
  },

  async getById(id: string): Promise<OfferApplication | null> {
    const all = await this.getAll();
    return all.find((a) => a.id === id) ?? null;
  },

  async getForTechnician(technicianId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.technicianId === technicianId);
  },

  async getForOffer(offerId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.offerId === offerId);
  },

  async getForCompany(companyId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.companyId === companyId);
  },

  async create(data: {
    technicianId: string;
    offerId: string;
    companyId: string;
    coverNote?: string;
  }): Promise<OfferApplication> {
    const all = await this.getAll();
    const offer = await offerRepository.getById(data.offerId);

    if (!isOfferOpenForTechnicians(offer) || offer?.companyId !== data.companyId) {
      throw new Error('This offer is no longer available.');
    }

    // Block any duplicate regardless of status — one application per technician per offer.
    // Supabase equivalent: UNIQUE(technician_id, offer_id) on offer_applications.
    const existingApplication = all.find(
      (a) => a.technicianId === data.technicianId && a.offerId === data.offerId,
    );
    if (existingApplication) throw new Error('You have already applied to this offer.');

    const directOffers = await storageAdapter.get<OfferRequest[]>(DB_KEYS.v2OfferRequests) ?? [];
    const existingActiveDirectOffer = directOffers.find(
      (request) =>
        request.companyId === data.companyId &&
        request.technicianId === data.technicianId &&
        request.offerId === data.offerId &&
        isActiveOfferRelationStatus(request.status),
    );
    if (existingActiveDirectOffer) {
      throw new Error('You already have a direct offer for this role. Review it from Direct Offers.');
    }

    const now = new Date().toISOString();
    const application: OfferApplication = {
      kind: 'application',
      id: `oapp-${uuid()}`,
      technicianId: data.technicianId,
      offerId: data.offerId,
      companyId: data.companyId,
      status: 'pending',
      identityRevealed: false,
      documentsUnlocked: false,
      coverNote: data.coverNote,
      createdAt: now,
      updatedAt: now,
    };

    await storageAdapter.set(DB_KEYS.v2OfferApplications, [...all, application]);
    await activityRepository.create({
      type: 'application_received',
      recipientRole: 'company',
      recipientId: data.companyId,
      entityId: application.id,
    });
    return application;
  },

  /**
   * Validates and applies a status transition. Local equivalent of transition_offer_application_status() RPC.
   * Handles all side effects (identityRevealed, documentsUnlocked, chat room, activity event) atomically in local storage.
   * Future Supabase: all side effects run server-side inside the RPC + handle_offer_relation_status_transition() trigger.
   * Frontend must call this method — never write identityRevealed or documentsUnlocked directly.
   */
  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferApplication | null> {
    const all = await this.getAll();
    const idx = all.findIndex((a) => a.id === id);
    if (idx === -1) return null;

    const prev = all[idx];
    assertOfferRelationTransition(prev.status, status);

    const isAccepted = shouldUnlockAcceptedRelation(status);
    const updated: OfferApplication = {
      ...prev,
      status,
      identityRevealed: isAccepted,
      documentsUnlocked: isAccepted,
      updatedAt: new Date().toISOString(),
    };

    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2OfferApplications, next);

    // Local simulation of the Supabase RPC/trigger side effects.
    // In production this must run server-side in the same transaction as the status transition.
    if (isAccepted) {
      await chatRepository.getOrCreateRoom({
        offerApplicationId: id,
        technicianId: prev.technicianId,
        companyId: prev.companyId,
      });
    }

    const activityType = getStatusActivityType('application', status);
    if (activityType) {
      await activityRepository.create({
        type: activityType,
        recipientRole: 'technician',
        recipientId: prev.technicianId,
        entityId: id,
      });
    }

    return updated;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferApplication | null> {
    const app = await this.getById(id);
    if (!app || app.technicianId !== technicianId) return null;
    if (app.status !== 'pending') throw new Error('Only pending applications can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};

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

export const offerRequestRepository = {
  async getAll(): Promise<OfferRequest[]> {
    return await storageAdapter.get<OfferRequest[]>(DB_KEYS.v2OfferRequests) ?? [];
  },

  async getById(id: string): Promise<OfferRequest | null> {
    const all = await this.getAll();
    return all.find((r) => r.id === id) ?? null;
  },

  async getForTechnician(technicianId: string): Promise<OfferRequest[]> {
    const all = await this.getAll();
    const technicianRequests = all.filter((r) => r.technicianId === technicianId);

    // Only pending direct offers are subject to offer-status filtering:
    // an inactive linked offer makes a pending offer non-actionable, so hide it from the list.
    // Accepted, rejected, expired, and withdrawn records are historical — always returned
    // regardless of the linked offer's current status (active relationship, audit trail, chat access).
    const results = await Promise.all(
      technicianRequests.map(async (request) => {
        if (request.status !== 'pending' || !request.offerId) return request;
        const offer = await offerRepository.getById(request.offerId);
        return isOfferOpenForTechnicians(offer) ? request : null;
      }),
    );

    return results.filter((r): r is OfferRequest => r !== null);
  },

  async getForCompany(companyId: string): Promise<OfferRequest[]> {
    const all = await this.getAll();
    return all.filter((r) => r.companyId === companyId);
  },

  async create(data: {
    companyId: string;
    technicianId: string;
    offerId?: string;
    message?: string;
  }): Promise<OfferRequest> {
    const all = await this.getAll();

    if (data.offerId) {
      const offer = await offerRepository.getById(data.offerId);
      if (!isOfferOpenForTechnicians(offer) || offer?.companyId !== data.companyId) {
        throw new Error('Closed or unpublished offers cannot be sent as direct offers.');
      }
    }

    const existingActiveDirectOffer = all.find(
      (r) =>
        r.companyId === data.companyId &&
        r.technicianId === data.technicianId &&
        isActiveOfferRelationStatus(r.status) &&
        (data.offerId ? r.offerId === data.offerId : !r.offerId),
    );
    if (existingActiveDirectOffer) throw new Error('An active direct offer already exists for this technician.');

    if (data.offerId) {
      const applications = await storageAdapter.get<OfferApplication[]>(DB_KEYS.v2OfferApplications) ?? [];
      const existingActiveApplication = applications.find(
        (application) =>
          application.companyId === data.companyId &&
          application.technicianId === data.technicianId &&
          application.offerId === data.offerId &&
          isActiveOfferRelationStatus(application.status),
      );
      if (existingActiveApplication) {
        throw new Error('This technician already has an active application for this offer.');
      }
    }

    const now = new Date().toISOString();
    const request: OfferRequest = {
      kind: 'direct_offer',
      id: `oreq-${uuid()}`,
      companyId: data.companyId,
      technicianId: data.technicianId,
      offerId: data.offerId,
      status: 'pending',
      identityRevealed: false,
      documentsUnlocked: false,
      message: data.message,
      createdAt: now,
      updatedAt: now,
    };

    await storageAdapter.set(DB_KEYS.v2OfferRequests, [...all, request]);
    await activityRepository.create({
      type: 'direct_offer_received',
      recipientRole: 'technician',
      recipientId: data.technicianId,
      entityId: request.id,
    });
    return request;
  },

  /**
   * Validates and applies a status transition. Local equivalent of transition_offer_request_status() RPC.
   * Handles all side effects (identityRevealed, documentsUnlocked, chat room, activity event) atomically in local storage.
   * Future Supabase: all side effects run server-side inside the RPC + handle_offer_relation_status_transition() trigger.
   * Frontend must call this method — never write identityRevealed or documentsUnlocked directly.
   */
  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferRequest | null> {
    const all = await this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    const prev = all[idx];
    assertOfferRelationTransition(prev.status, status);
    if (status === 'accepted' && prev.offerId) {
      const offer = await offerRepository.getById(prev.offerId);
      if (!isOfferOpenForTechnicians(offer)) {
        throw new Error('This offer is no longer active.');
      }
    }

    const isAccepted = shouldUnlockAcceptedRelation(status);
    const updated: OfferRequest = {
      ...prev,
      status,
      identityRevealed: isAccepted,
      documentsUnlocked: isAccepted,
      updatedAt: new Date().toISOString(),
    };

    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2OfferRequests, next);

    // Local simulation of the Supabase RPC/trigger side effects.
    // In production this must run server-side in the same transaction as the status transition.
    if (isAccepted) {
      await chatRepository.getOrCreateRoom({
        offerRequestId: id,
        technicianId: prev.technicianId,
        companyId: prev.companyId,
      });
    }

    const activityType = getStatusActivityType('direct_offer', status);
    if (activityType) {
      await activityRepository.create({
        type: activityType,
        recipientRole: 'company',
        recipientId: prev.companyId,
        entityId: id,
      });
    }

    return updated;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferRequest | null> {
    const req = await this.getById(id);
    if (!req || req.technicianId !== technicianId) return null;
    if (req.status !== 'pending') throw new Error('Only pending requests can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};
